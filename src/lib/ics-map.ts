// §22 — Map AgendaItem[] → IcsEvent[]. Lives in its own file so calendarView.ts
// stays focused on data fetching, and so the IcsEvent-shape concerns (RRULE,
// stable UID, source-color → X-APPLE-CALENDAR-COLOR) are co-located with the
// ics.ts builder types.

import { dayIndex } from "./dates";
import { stableUid, type IcsEvent } from "./ics";
import type { AgendaItem } from "./calendarView";

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function fmtUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    (d.getUTCMonth() + 1).toString().padStart(2, "0") +
    d.getUTCDate().toString().padStart(2, "0") +
    "T" +
    d.getUTCHours().toString().padStart(2, "0") +
    d.getUTCMinutes().toString().padStart(2, "0") +
    d.getUTCSeconds().toString().padStart(2, "0") +
    "Z"
  );
}

export function buildIcsEvents(
  agenda: AgendaItem[],
  opts: { until: Date; now?: Date }
): IcsEvent[] {
  const now = opts.now ?? new Date();
  return agenda.map((item) => {
    const isRecurring = item.source === "timetable";
    // UID bucket: for timetable, include the occurrence date so cancelling a
    // single week's class (by deleting the row in v2) only affects that
    // occurrence. For assignments/exams, the row id is the whole story.
    const key = isRecurring
      ? `${item._sourceId ?? "?"}:${item._occurrenceKey ?? "?"}`
      : item._sourceId ?? "?";

    return {
      uid: stableUid(item.source, key),
      summary: item.title,
      description: item.subtitle,
      // Timetable already has a "Room AB-204" subtitle; surface that as
      // LOCATION so clients render it on the map view.
      location: item.source === "timetable" ? item.subtitle : undefined,
      start: item.start,
      end: item.end,
      allDay: item.isAllDay,
      rrule: isRecurring
        ? `FREQ=WEEKLY;BYDAY=${BYDAY[dayIndex(item.start)]};UNTIL=${fmtUtc(opts.until)}`
        : undefined,
      color: item.color ?? undefined,
      source: item.source,
      lastModified: now,
    };
  });
}
