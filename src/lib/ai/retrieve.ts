// §12 + §27 — Controlled retrieval for "Ask My College"
//
// SECURITY MODEL: We never send raw DB rows or any other student's data to the
// LLM. This function pulls *only* the slices of the requesting user's own data
// that the question likely needs, and returns a structured object with named
// fields. The caller is responsible for converting that object into a strict
// system prompt that tells the model to answer ONLY from those fields.
//
// Intent routing is a simple keyword/heuristic pass over the user's question.
// It's not perfect, but it's predictable, cheap, and auditable — exactly the
// trade-off we want at this stage. We over-fetch slightly (always include
// the next 7 days of deadlines + attendance overview) so the model can answer
// follow-ups without losing context.

import { prisma } from "../prisma";
import { attendanceInsight } from "../attendance";
import { dayIndex, formatDateShort, format12, toMinutes, nowMinutes } from "../dates";
import { searchDocuments } from "../documents/search";

export type Intent =
  | "timetable_today"
  | "timetable_tomorrow"
  | "timetable_week"
  | "timetable_next_class"
  | "assignments_due"
  | "assignments_pending"
  | "exam_next"
  | "exam_upcoming"
  | "attendance_summary"
  | "attendance_can_miss"
  | "notices_recent"
  | "profile"
  | "documents"
  | "general";

export interface RetrievalSlice {
  key: string;
  summary: string;
  data: unknown;
}

export interface RetrievalResult {
  intent: Intent;
  /** All keys actually populated — used for the audit trail on the message. */
  keys: string[];
  /** Short human-readable text block to inject into the system prompt. */
  contextText: string;
  /** Structured slices, in case the UI wants to show "what the AI saw". */
  slices: RetrievalSlice[];
  /** When the user has nothing on file (e.g. no subjects yet). */
  empty: boolean;
}

const MS_DAY = 24 * 60 * 60 * 1000;

// Exported for the §19 intent-routing test harness. Internal callers still
// use it via the local reference inside retrieve().
//
// Routing rules of thumb (in priority order):
//   - "can i miss" / "bunk" / "skip class" are unmistakable attendance intents.
//   - "next class" / "next period" is a class query, not an exam query.
//   - "tomorrow" branches on whether the question is about the timetable or
//     about deadlines.
//   - "today" + class keyword is the timetable_today signal.
//   - Exam-specific keywords (exam, test, midterm, end sem) win over the
//     generic "schedule" / "week" — otherwise "midterm schedule" routes to
//     timetable_week, which is wrong.
//   - "pending" / "todo" wins over the generic "task" — otherwise "show
//     pending tasks" routes to assignments_due.
//   - The generic "due" / "assignment" / "deadline" / "homework" / "task"
//     keyword (without "pending") routes to assignments_due.
export function classifyIntent(q: string): Intent {
  const s = q.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => s.includes(w));

  if (has("can i miss", "can i skip", "skip class", "bunk", "how many can i miss", "miss class"))
    return "attendance_can_miss";
  if (has("attendance"))
    return "attendance_summary";
  if (has("next class", "where do i go", "what's my next", "next period"))
    return "timetable_next_class";
  if (has("tomorrow"))
    return has("class", "schedule", "lecture", "free") ? "timetable_tomorrow" : "assignments_due";
  if (has("today") && has("class", "schedule", "lecture", "period"))
    return "timetable_today";
  // Exam signals before "schedule" / "week" — "midterm schedule" is exams, not the timetable.
  if (has("next exam", "when is my exam", "exam date", "when's my exam"))
    return "exam_next";
  if (has("exam", "test", "midterm", "mid-term", "end sem", "semester exam"))
    return "exam_upcoming";
  // "pending" / "todo" / "haven't" before generic assignment keywords.
  if (has("pending", "todo", "to-do", "haven't"))
    return "assignments_pending";
  if (has("due", "deadline", "assignment", "homework", "task", "submit"))
    return "assignments_due";
  if (has("timetable", "schedule", "weekly", "this week", "week", "classes", "lecture"))
    return "timetable_week";
  // §21 — Document Vault queries. "summarize" / "from my notes" / "PYQ" are
  // unmistakable; we keep this conservative so it doesn't steal
  // structured-data questions ("my weekly schedule" must still be
  // timetable_week, not documents).
  if (
    has(
      "summarize",
      "summary",
      "summarise",
      "according to my",
      "from my notes",
      "from my pdf",
      "from my document",
      "from my pyq",
      "from my file",
      "what does my doc",
      "what's in my notes",
      "pyq",
      "previous year"
    ) ||
    (has("notes", "pdf", "document", "file") && has("from my", "my notes", "my pdf", "my doc", "my file", "in my"))
  )
    return "documents";
  if (has("notice", "announcement", "circular", "news"))
    return "notices_recent";
  if (has("profile", "my name", "my course", "my cgpa", "my semester"))
    return "profile";
  return "general";
}

function dayName(idx: number): string {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][idx];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function retrieve(userId: string, question: string): Promise<RetrievalResult> {
  const intent = classifyIntent(question);
  const now = new Date();
  const todayIdx = dayIndex(now);
  const today0 = startOfDay(now);

  // Always fetch in parallel — over-fetching is fine, the prompt only includes
  // what it needs. This keeps the per-request latency to one round-trip.
  const [timetable, assignments, exams, attendance, notices, subjects, student] =
    await Promise.all([
      prisma.timetableEntry.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
        orderBy: [{ day: "asc" }, { start: "asc" }],
      }),
      prisma.assignment.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.exam.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.attendance.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
      }),
      prisma.notice.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.subject.findMany({ where: { userId } }),
      prisma.student.findUnique({ where: { userId } }),
    ]);

  const slices: RetrievalSlice[] = [];
  const parts: string[] = [];
  const keys: string[] = [];

  // ---------------- profile (always include as anchor) ----------------
  if (student) {
    const text =
      `Student profile: ${student.course || "—"} Semester ${student.semester}, ` +
      `CGPA ${student.cgpa ?? "—"}, ${student.collegeName || "—"}, ` +
      `Streak: ${student.streak} day(s).`;
    slices.push({ key: "profile", summary: text, data: student });
    parts.push(text);
    keys.push("profile");
  }

  // ---------------- timetable slices ----------------
  const dayMap = new Map<number, typeof timetable>();
  for (const t of timetable) {
    if (!dayMap.has(t.day)) dayMap.set(t.day, []);
    dayMap.get(t.day)!.push(t);
  }
  const fmtTimetable = (entries: typeof timetable) =>
    entries
      .map((t) => {
        const title = t.type === "break" ? t.label || "Break" : t.subject?.name || t.label || "Class";
        return `- ${format12(t.start)}–${format12(t.end)} ${title}${t.room ? ` (Room ${t.room})` : ""}`;
      })
      .join("\n");

  if (intent === "timetable_today") {
    const day = dayMap.get(todayIdx) || [];
    const text = `Today's timetable (${dayName(todayIdx)}):\n${day.length ? fmtTimetable(day) : "No classes today."}`;
    slices.push({ key: "timetable.today", summary: text, data: day });
    parts.push(text);
    keys.push("timetable.today");
  } else if (intent === "timetable_tomorrow") {
    const tomorrowIdx = (todayIdx + 1) % 7;
    const day = dayMap.get(tomorrowIdx) || [];
    const text = `Tomorrow's timetable (${dayName(tomorrowIdx)}):\n${day.length ? fmtTimetable(day) : "No classes tomorrow."}`;
    slices.push({ key: "timetable.tomorrow", summary: text, data: day });
    parts.push(text);
    keys.push("timetable.tomorrow");
  } else if (intent === "timetable_week") {
    const lines: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = dayMap.get(i) || [];
      lines.push(`${dayName(i)}:`);
      lines.push(day.length ? fmtTimetable(day) : "  (no classes)");
    }
    const text = `Weekly timetable:\n${lines.join("\n")}`;
    slices.push({ key: "timetable.week", summary: text, data: Object.fromEntries(dayMap) });
    parts.push(text);
    keys.push("timetable.week");
  } else if (intent === "timetable_next_class") {
    const todays = (dayMap.get(todayIdx) || []).filter(
      (c) => c.type !== "break" && toMinutes(c.start) >= nowMinutes()
    );
    let next: (typeof timetable)[number] | null = todays[0] || null;
    if (!next) {
      for (let offset = 1; offset <= 7; offset++) {
        const day = dayMap.get((todayIdx + offset) % 7) || [];
        const cand = day.find((c) => c.type !== "break");
        if (cand) {
          next = cand;
          break;
        }
      }
    }
    if (next) {
      const mins = minutesUntilNext(next);
      const text =
        `Next class: ${next.subject?.name || next.label || "Class"} ` +
        `at ${format12(next.start)}${next.room ? ` in ${next.room}` : ""} ` +
        `(starts ${mins > 0 ? `in ${mins} min` : "now or just started"}).`;
      slices.push({ key: "timetable.next", summary: text, data: next });
      parts.push(text);
    } else {
      const text = "No upcoming class found in the timetable.";
      slices.push({ key: "timetable.next", summary: text, data: null });
      parts.push(text);
    }
    keys.push("timetable.next");
  }

  // ---------------- assignment slices ----------------
  if (
    intent === "assignments_due" ||
    intent === "assignments_pending" ||
    intent === "general" ||
    intent === "timetable_tomorrow"
  ) {
    const open = assignments.filter((a) => a.status !== "submitted");
    const horizon = new Date(today0.getTime() + 7 * MS_DAY);
    const dueSoon = open.filter((a) => a.dueDate.getTime() <= horizon.getTime());
    const overdue = open.filter((a) => a.dueDate.getTime() < today0.getTime());

    const fmtA = (a: (typeof assignments)[number]) => {
      const d = a.dueDate;
      const days = Math.round((d.getTime() - today0.getTime()) / MS_DAY);
      const when =
        days < 0 ? `${-days}d overdue` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days}d`;
      return `- "${a.title}"${a.subject ? ` (${a.subject.name})` : ""} — ${when} (${a.priority}, ${a.status.replace("_", " ")})`;
    };

    const lines: string[] = [];
    if (overdue.length) {
      lines.push(`Overdue (${overdue.length}):`);
      lines.push(...overdue.slice(0, 5).map(fmtA));
    }
    if (dueSoon.length) {
      lines.push(`Due in the next 7 days (${dueSoon.length}):`);
      lines.push(...dueSoon.slice(0, 8).map(fmtA));
    }
    if (!lines.length) {
      lines.push("No open assignments due in the next 7 days.");
    }
    const text = `Assignments:\n${lines.join("\n")}`;
    slices.push({ key: "assignments.week", summary: text, data: { overdue, dueSoon } });
    parts.push(text);
    keys.push("assignments.week");
  }

  // ---------------- exam slices ----------------
  if (
    intent === "exam_next" ||
    intent === "exam_upcoming" ||
    intent === "general" ||
    intent === "timetable_tomorrow"
  ) {
    const future = exams.filter((e) => e.date.getTime() >= today0.getTime() - MS_DAY);
    const fmtE = (e: (typeof exams)[number]) => {
      const days = Math.ceil((e.date.getTime() - today0.getTime()) / MS_DAY);
      const when = days <= 0 ? "today/past" : days === 1 ? "tomorrow" : `in ${days}d`;
      return `- "${e.title}"${e.subject ? ` (${e.subject.name})` : ""} — ${formatDateShort(e.date)}${e.time ? ` ${e.time}` : ""} (${when}), prep ${e.prepPercent}%`;
    };
    const text = future.length
      ? `Upcoming exams:\n${future.slice(0, 5).map(fmtE).join("\n")}`
      : "No upcoming exams.";
    slices.push({ key: "exams.upcoming", summary: text, data: future });
    parts.push(text);
    keys.push("exams.upcoming");
  }

  // ---------------- attendance slices ----------------
  if (
    intent === "attendance_summary" ||
    intent === "attendance_can_miss" ||
    intent === "general"
  ) {
    const lines = attendance.map((a) => {
      const ins = attendanceInsight(a.total, a.attended, a.threshold);
      return `- ${a.subject?.name || "Subject"}: ${ins.percent}% (${a.attended}/${a.total}), threshold ${a.threshold}%, status ${ins.status}, can miss ${ins.canMiss}, need to attend ${ins.needToAttend}`;
    });
    const text = lines.length
      ? `Attendance:\n${lines.join("\n")}\n${hintAttendance(intent, attendance)}`
      : "No attendance records yet.";
    slices.push({ key: "attendance.all", summary: text, data: attendance });
    parts.push(text);
    keys.push("attendance.all");
  }

  // ---------------- notices ----------------
  if (intent === "notices_recent" || intent === "general") {
    const text = notices.length
      ? `Recent notices (${notices.length}):\n` +
        notices
          .slice(0, 5)
          .map((n) => `- [${n.category}] ${n.title}${n.isRead ? "" : " (new)"}`)
          .join("\n")
      : "No notices.";
    slices.push({ key: "notices.recent", summary: text, data: notices });
    parts.push(text);
    keys.push("notices.recent");
  }

  // ---------------- subjects (anchor) ----------------
  if (subjects.length) {
    const text = `Subjects: ${subjects.map((s) => s.name).join(", ")}.`;
    slices.push({ key: "subjects", summary: text, data: subjects });
    parts.push(text);
    keys.push("subjects");
  }

  // ---------------- documents (RAG) ----------------
  // §21 — Semantic search over the user's DocumentChunks. Fires when the
  // intent is `documents` (the user is clearly asking about their uploaded
  // material) or `general` (a casual question that might still find an
  // answer in the notes). Embedding the query costs one inference; the
  // brute-force cosine over the user's chunks is cheap up to ~10K.
  if (intent === "documents" || intent === "general") {
    try {
      const result = await searchDocuments(userId, question, 3);
      if (result.chunks.length) {
        const text =
          "Relevant snippets from your documents:\n" +
          result.chunks
            .map(
              (c) =>
                `[Source: ${c.title}] ${c.text.slice(0, 600)}`
            )
            .join("\n\n");
        slices.push({
          key: "documents.context",
          summary: text,
          data: result.chunks,
        });
        parts.push(text);
        keys.push("documents.context");
      }
    } catch (err) {
      // Don't fail the whole retrieval if RAG is unavailable — fall back
      // to the structured-data slices.
      console.error("[retrieve] documents search failed", err);
    }
  }

  const empty =
    !student && subjects.length === 0 && timetable.length === 0 && assignments.length === 0;

  return {
    intent,
    keys,
    contextText: parts.join("\n\n"),
    slices,
    empty,
  };
}

function hintAttendance(
  intent: Intent,
  attendance: { total: number; attended: number; threshold: number }[]
): string {
  if (intent !== "attendance_can_miss") return "";
  const critical = attendance
    .map((a) => {
      const ins = attendanceInsight(a.total, a.attended, a.threshold);
      if (ins.percent < a.threshold) {
        return `You need to attend the next ${ins.needToAttend} class(es) to reach ${a.threshold}%.`;
      }
      return `You can miss ${ins.canMiss} more class(es) and stay above ${a.threshold}%.`;
    })
    .join(" ");
  return critical;
}

function minutesUntilNext(entry: { start: string; day: number }): number {
  const now = new Date();
  const todayIdx = dayIndex(now);
  const offset = (entry.day - todayIdx + 7) % 7;
  const base = new Date(now);
  base.setDate(base.getDate() + offset);
  base.setHours(0, 0, 0, 0);
  base.setMinutes(toMinutes(entry.start));
  return Math.round((base.getTime() - now.getTime()) / 60000);
}
