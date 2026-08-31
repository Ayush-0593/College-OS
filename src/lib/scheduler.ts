// §14 — Smart Reminders scheduler.
//
// One process, one setInterval, three ticks per user per minute. Idempotent —
// module-level flag means HMR / multiple import sites don't pile up timers.
//
// Caveat: the scheduler only ticks while the Next.js dev process is running.
// In production, replace this with Vercel Cron or a worker queue.

import { prisma } from "./prisma";
import {
  attendanceInsight,
  type AttendanceInsight,
} from "./attendance";
import {
  dayIndex,
  dateKey,
  minutesUntil,
  toMinutes,
  nowMinutes,
} from "./dates";
import {
  fire,
  getPrefs,
  prefAllows,
  type NotificationItem,
} from "./notifications";

let started = false;
let interval: NodeJS.Timeout | null = null;
const TICK_MS = 60_000;

export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log("[scheduler] starting — every " + TICK_MS / 1000 + "s");

  // Run once shortly after boot so a fresh server doesn't wait a full minute
  // for the first tick. The "run immediately + every interval" pattern is the
  // standard setInterval-with-initial-fire idiom.
  setTimeout(() => {
    void tickAll().catch((e) => console.error("[scheduler] initial tick", e));
  }, 2000);

  interval = setInterval(() => {
    void tickAll().catch((e) => console.error("[scheduler] tick", e));
  }, TICK_MS);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  started = false;
}

async function tickAll(): Promise<void> {
  // Iterate per user so one user's tick error doesn't starve others. The
  // user set is small (a few rows on this dev DB) — if it ever grows, switch
  // to a cursor / chunked query.
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id: userId } of users) {
    try {
      await tickUser(userId);
    } catch (err) {
      console.error(`[scheduler] tick failed for user ${userId}`, err);
    }
  }
}

async function tickUser(userId: string): Promise<void> {
  const prefs = await getPrefs(userId);
  const items: NotificationItem[] = [];

  if (prefAllows(prefs, "class_soon")) {
    items.push(...(await tickClassReminders(userId)));
  }
  if (prefAllows(prefs, "due_tomorrow")) {
    items.push(...(await tickAssignmentReminders(userId)));
  }
  if (prefAllows(prefs, "attendance_low")) {
    items.push(...(await tickAttendanceReminders(userId)));
  }
  if (prefAllows(prefs, "exam_soon")) {
    items.push(...(await tickExamReminders(userId)));
  }

  // §18 — Daily roll-ups. Gated by time-of-day so a 60s tick only tries to
  // fire at the natural transition windows. The per-day dedup key handles
  // the case where the window is wide enough to span multiple ticks.
  if (prefAllows(prefs, "morning_digest") && isInMorningWindow()) {
    const m = await tickRollup(userId, "morning");
    if (m) items.push(m);
  }
  if (prefAllows(prefs, "evening_digest") && isInEveningWindow()) {
    const e = await tickRollup(userId, "evening");
    if (e) items.push(e);
  }

  if (items.length > 0) {
    await fire(userId, items);
  }
}

// ─── Class in ~30 min ─────────────────────────────────────────────────────

async function tickClassReminders(userId: string): Promise<NotificationItem[]> {
  const todayIdx = dayIndex(new Date());
  const entries = await prisma.timetableEntry.findMany({
    where: { userId, day: todayIdx, type: "class" },
    include: { subject: { select: { name: true, color: true } } },
  });

  const out: NotificationItem[] = [];
  for (const e of entries) {
    if (!e.subject) continue; // skip entries without a subject binding
    const mins = minutesUntil(e.start, 0);
    // 2-min tolerance: a tick 90s late still catches a 30-min-ahead entry.
    if (mins < 29 || mins > 31) continue;
    const subjectName = e.subject.name;
    const room = e.room ? ` · Room ${e.room}` : "";
    out.push({
      kind: "class_soon",
      title: `${subjectName} in 30 min`,
      body: `${e.start}${room}`,
      href: "/timetable",
      sourceId: e.id,
    });
  }
  return out;
}

// ─── Assignment due tomorrow ──────────────────────────────────────────────

async function tickAssignmentReminders(
  userId: string
): Promise<NotificationItem[]> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const assignments = await prisma.assignment.findMany({
    where: {
      userId,
      status: { not: "submitted" },
      dueDate: { gte: start, lte: end },
    },
    include: { subject: { select: { name: true } } },
  });

  return assignments.map((a) => ({
    kind: "due_tomorrow",
    title: `${a.title} due tomorrow`,
    body: a.subject?.name ?? null,
    href: "/assignments",
    sourceId: a.id,
    // bucket by the due date (not today), so the dedup key survives if we
    // tick on the same day across midnight edge cases.
    date: dateKey(start),
  }));
}

// ─── Low attendance ───────────────────────────────────────────────────────

async function tickAttendanceReminders(
  userId: string
): Promise<NotificationItem[]> {
  const rows = await prisma.attendance.findMany({
    where: { userId },
    include: { subject: { select: { name: true } } },
  });

  const out: NotificationItem[] = [];
  for (const r of rows) {
    const ins: AttendanceInsight = attendanceInsight(
      r.total,
      r.attended,
      r.threshold
    );
    if (ins.status === "good") continue;
    const subjectName = r.subject?.name ?? "Subject";
    const body =
      ins.status === "critical"
        ? `Attend the next ${ins.needToAttend} to reach ${r.threshold}%`
        : `Stay above ${r.threshold}% — only ${ins.canMiss} can be missed`;
    out.push({
      kind: "attendance_low",
      title: `${subjectName} attendance at ${Math.round(ins.percent)}%`,
      body,
      href: "/attendance",
      sourceId: r.subjectId,
    });
  }
  return out;
}

// ─── Upcoming exams (7-day window) ────────────────────────────────────────

async function tickExamReminders(
  userId: string
): Promise<NotificationItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 7);
  cutoff.setHours(23, 59, 59, 999);

  const exams = await prisma.exam.findMany({
    where: { userId, date: { gte: today, lte: cutoff } },
    include: { subject: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  const out: NotificationItem[] = [];
  for (const e of exams) {
    const examDay = new Date(e.date);
    examDay.setHours(0, 0, 0, 0);
    const daysUntil = Math.round(
      (examDay.getTime() - today.getTime()) / 86_400_000
    );
    const subjectName = e.subject?.name ?? "Subject";
    const proximity =
      daysUntil === 0
        ? `today${e.time ? ` at ${e.time}` : ""}`
        : daysUntil === 1
        ? "tomorrow"
        : `in ${daysUntil} days`;
    out.push({
      kind: "exam_soon",
      title: `${e.title} ${proximity}`,
      body: subjectName,
      href: "/exams",
      sourceId: e.id,
      // Bucket the dedup key by *today* (not the exam date) so the same exam
      // re-fires on each day of the prep window. With one row per (exam, day)
      // the user gets 7 days of escalating reminders before the exam.
      date: dateKey(today),
    });
  }
  return out;
}

// Used only to silence the unused-import warning if someone trims the
// scheduler down. `nowMinutes` and `toMinutes` are part of the public API of
// dates and may be needed in future ticks; leave them referenced so the
// import survives a careless edit.
void nowMinutes;
void toMinutes;

// ─── §18 — Daily morning / evening roll-ups ────────────────────────────────

/**
 * Time-of-day gates. The 2-hour window absorbs server-restart edge cases
 * (a fresh server that starts at 6:55 AM still catches the 7 AM roll-up,
 * and any tick that re-runs inside the window is swallowed by the per-day
 * dedup key). Outside the window the tick is a no-op.
 */
function isInMorningWindow(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h === 6 || h === 7;
}

function isInEveningWindow(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h === 20 || h === 21;
}

/**
 * Build a single roll-up notification for the given user + period. Returns
 * `null` if all four counts are zero (we don't fire empty roll-ups).
 *
 * The four data points are intentionally a one-shot read, not a derivative
 * of other notifications: a roll-up's "2 due tomorrow" count is the current
 * count at fire time, independent of the `due_tomorrow` rows already in the
 * bell. This is by design — the user wants a snapshot, not a history.
 */
async function tickRollup(
  userId: string,
  period: "morning" | "evening"
): Promise<NotificationItem | null> {
  const kind = period === "morning" ? "morning_digest" : "evening_digest";

  const now = new Date();
  const todayIdx = dayIndex(now);

  // Tomorrow's window: 00:00:00.000 – 23:59:59.999 local
  const startTomorrow = new Date(now);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  startTomorrow.setHours(0, 0, 0, 0);
  const endTomorrow = new Date(startTomorrow);
  endTomorrow.setHours(23, 59, 59, 999);

  const [timetable, assignmentsDueTomorrow, attendance, unreadNotices] =
    await Promise.all([
      prisma.timetableEntry.findMany({
        where: { userId, day: todayIdx, type: "class" },
        select: { id: true },
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          status: { not: "submitted" },
          dueDate: { gte: startTomorrow, lte: endTomorrow },
        },
        select: { id: true },
      }),
      prisma.attendance.findMany({
        where: { userId },
        include: { subject: { select: { name: true } } },
      }),
      prisma.notice.count({ where: { userId, isRead: false } }),
    ]);

  const classCount = timetable.length;
  const dueCount = assignmentsDueTomorrow.length;
  const lowAttCount = attendance.filter((r) => {
    const ins = attendanceInsight(r.total, r.attended, r.threshold);
    return ins.status !== "good";
  }).length;
  const noticeCount = unreadNotices;

  // Empty suppression — a roll-up with all-zero fields would be noise.
  if (classCount === 0 && dueCount === 0 && lowAttCount === 0 && noticeCount === 0) {
    return null;
  }

  // Body shape: comma-less `·` separators so the bell's truncate doesn't cut
  // mid-word. Each segment is a self-contained "N thing" phrase. Order is
  // intentional: classes → deadlines → attendance → notices (matches the
  // dashboard's stat-card order so the user recognizes the summary).
  const parts: string[] = [];
  if (classCount > 0) {
    parts.push(`${classCount} ${classCount === 1 ? "class" : "classes"} today`);
  }
  if (dueCount > 0) {
    parts.push(`${dueCount} due tomorrow`);
  }
  if (lowAttCount > 0) {
    parts.push(`attendance low in ${lowAttCount}`);
  }
  if (noticeCount > 0) {
    parts.push(`${noticeCount} new ${noticeCount === 1 ? "notice" : "notices"}`);
  }

  const title = period === "morning" ? "Morning brief" : "Evening brief";

  return {
    kind,
    title,
    body: parts.join(" · "),
    href: "/dashboard",
    // sourceId is the synthetic dedup handle for "morning" / "evening".
    // Combined with `date: today` (passed to fire()) this gives the key
    // morning_digest:morning:2026-08-27 — one row per (user, day, kind).
    sourceId: period,
  };
}
