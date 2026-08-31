// §22 — Builds the agenda + ICS event list shared by /api/calendar.ics and
// /calendar. One function, two consumers: the ICS route calls it with a wide
// window (-30..365 days) and maps to IcsEvent[]; the agenda page calls it
// with a 30-day window and renders the items directly.
//
// Assignment filter: `status === "submitted"` is dropped per user choice.
// `late` assignments stay visible — the student still needs the deadline
// reminder, even if the deadline is past.

import { prisma } from "@/lib/prisma";
import {
  DAY_NAMES,
  addDays,
  addHours,
  combineDateTime,
  dateKey,
  dayIndex,
  parseDateKey,
  startOfDay,
} from "@/lib/dates";
import { buildIcsEvents as buildIcsEventsImpl } from "./ics-map";
import type { IcsEvent, IcsSource } from "./ics";

export interface AgendaItem {
  /** Local midnight of the day this item falls on. */
  date: Date;
  /** Local datetime the item starts. */
  start: Date;
  /** Local datetime the item ends. */
  end: Date;
  /** "Data Structures — Class" / "Binary Tree Assignment" / "DS Mid-Term". */
  title: string;
  /** Room / "DUE — Subject" / subject name. */
  subtitle?: string;
  source: IcsSource;
  /** "Class" | "Assignment" | "Late" | "Exam" — rendered as a badge. */
  sourceLabel: string;
  /** Subject color (hex), used for the dot. */
  color?: string | null;
  /** Link to the originating page (assignments, exams). */
  href?: string;
  /** True for all-day events (no time of day). v1: always false. */
  isAllDay?: boolean;

  // ─── private UID-derivation fields (used only by buildIcsEvents) ───
  /** Stable source-row id. Populated by buildAgenda; ignored by the UI. */
  _sourceId?: string;
  /** For timetable, the concrete date this occurrence falls on (yyyy-mm-dd). */
  _occurrenceKey?: string;
}

export interface BuildAgendaOpts {
  /** Window start, in days relative to "now". Default 0 (today). */
  fromDays?: number;
  /** Window end, in days relative to "now". Default 30. */
  toDays?: number;
}

export async function buildAgenda(
  userId: string,
  opts: BuildAgendaOpts = {}
): Promise<AgendaItem[]> {
  const fromDays = opts.fromDays ?? 0;
  const toDays = opts.toDays ?? 30;
  const now = new Date();
  const from = startOfDay(addDays(now, fromDays));
  // `to` is exclusive: the loop in the timetable expansion uses `d <= to`,
  // so we set `to` to the start-of-day of (toDays) and let the comparison
  // include that whole day. We also widen by +1 for the Prisma filters so
  // assignments/exams due at the end of the day are included.
  const to = startOfDay(addDays(now, toDays));
  const toPrismaUpper = addDays(to, 1);

  const [timetable, assignments, exams] = await Promise.all([
    prisma.timetableEntry.findMany({
      where: { userId },
      include: { subject: { select: { name: true, color: true } } },
    }),
    prisma.assignment.findMany({
      where: {
        userId,
        // §22 — drop only "submitted"; "late" stays visible.
        status: { not: "submitted" },
        dueDate: { gte: from, lte: toPrismaUpper },
      },
      include: { subject: { select: { name: true, color: true } } },
    }),
    prisma.exam.findMany({
      where: {
        userId,
        date: { gte: from, lte: toPrismaUpper },
      },
      include: { subject: { select: { name: true, color: true } } },
    }),
  ]);

  const items: AgendaItem[] = [];

  // Timetable — expand each weekly entry into concrete dates within [from, to].
  for (const e of timetable) {
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      if (dayIndex(d) !== e.day) continue;
      const start = combineDateTime(dateKey(d), e.start);
      const end = combineDateTime(dateKey(d), e.end);
      const isBreak = e.type === "break";
      items.push({
        date: d,
        start,
        end,
        title: isBreak
          ? e.label || "Break"
          : `${e.subject?.name ?? "Class"} — ${labelForType(e.type)}`,
        subtitle: isBreak
          ? undefined
          : e.room
          ? `Room ${e.room}`
          : e.subject?.name ?? undefined,
        source: "timetable",
        sourceLabel: isBreak ? "Break" : "Class",
        // Use the entry's subject color; falls back to a neutral slate for
        // breaks and orphaned subject links.
        color: e.subject?.color ?? null,
        _sourceId: e.id,
        _occurrenceKey: dateKey(d),
      });
    }
  }

  // Assignments — single point in time, status filter applied in query.
  for (const a of assignments) {
    const due = new Date(a.dueDate);
    items.push({
      date: startOfDay(due),
      start: due,
      // Default 1-hour duration so it shows as a block, not a zero-length
      // event that some clients render oddly.
      end: addHours(due, 1),
      title: a.title,
      subtitle: `DUE — ${a.subject?.name ?? "Unassigned"}`,
      source: "assignment",
      sourceLabel: a.status === "late" ? "Late" : "Assignment",
      color: a.subject?.color ?? null,
      href: `/assignments?focus=${a.id}`,
      _sourceId: a.id,
    });
  }

  // Exams — `date` is already a real datetime (set to 09:00 by the seed
  // when `time` is null; set to a real time when `time` is given). The
  // separate `time` string ("10:00 AM") is for display only.
  for (const x of exams) {
    const start = new Date(x.date);
    // 2-hour default exam block; will look right for both AM and PM seeds.
    const end = addHours(start, 2);
    items.push({
      date: startOfDay(start),
      start,
      end,
      title: x.title,
      subtitle: x.subject?.name ?? undefined,
      source: "exam",
      sourceLabel: "Exam",
      color: x.subject?.color ?? null,
      href: `/exams?focus=${x.id}`,
      _sourceId: x.id,
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  return items;
}

/**
 * Map `AgendaItem[]` → `IcsEvent[]`. Adds:
 *   - stable UIDs (sha1 per (source, sourceId) [+ occurrence date for timetable])
 *   - RRULE for timetable events so the calendar client auto-repeats them
 *
 * `until` is the inclusive end of the feed's repeating window. v1 uses
 * `now + 365 days` (rolling 1-year); v2 will swap in `student.semesterEnd`.
 */
export function buildIcsEvents(
  agenda: AgendaItem[],
  opts: { until: Date; now?: Date }
): IcsEvent[] {
  return buildIcsEventsImpl(agenda, opts);
}

// ──────────────────────────── internals ────────────────────────────

function labelForType(t: string): string {
  switch (t) {
    case "lab":
      return "Lab";
    case "break":
      return "Break";
    case "class":
    default:
      return "Class";
  }
}
