// §22 — Hand-rolled RFC 5545 (iCalendar) feed builder.
//
// We avoid an external `ical-generator` dep because:
//   1. The output is short and we want exact control of line folding, TEXT
//      escaping, RRULE formatting, and UID stability.
//   2. The project norm is small, focused libs with no transitive deps.
//
// Time handling: VEVENTs use **floating local times** (no `Z` suffix, no
// `TZID` parameter). Per RFC 5545 §3.3.5, floating times are interpreted in
// the calendar's local timezone — which is what the user wants for a college
// schedule ("9 AM Monday" wherever they happen to be). This avoids needing a
// fragile VTIMEZONE block with DST rules per timezone. The single global
// `DTSTAMP` and `LAST-MODIFIED` are UTC (the `Z` suffix), per spec.
//
// Line endings are CRLF throughout (RFC 5545 §3.1). Lines are folded at 75
// octets (UTF-8 aware, so multi-byte characters don't get split).
//
// UIDs are sha1("college-os:" + source + ":" + key) + "@college.os" — stable
// across re-fetches so calendar clients update in place rather than spawning
// duplicates.

import { createHash } from "node:crypto";

export type IcsSource = "timetable" | "assignment" | "exam";

export interface IcsEvent {
  /** Stable unique id, required by RFC 5545. */
  uid: string;
  /** Event title. Will be RFC-5545-escaped and line-folded. */
  summary: string;
  /** Optional free-text description. */
  description?: string;
  /** Optional venue / room. */
  location?: string;
  /** Local-time start. */
  start: Date;
  /** Local-time end. */
  end: Date;
  /** When true, the event is emitted as a DATE (all-day) rather than DATE-TIME. */
  allDay?: boolean;
  /** RFC 5545 RRULE line value, e.g. "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270827T235959Z". */
  rrule?: string;
  /** Subject hex color (no `#`). Sets CATEGORIES + X-APPLE-CALENDAR-COLOR. */
  color?: string;
  /** Logical source for the CATEGORIES line; also used by clients to tint. */
  source: IcsSource;
  /** Optional LAST-MODIFIED; defaults to now (UTC). */
  lastModified?: Date;
}

export interface IcsFeedInput {
  events: IcsEvent[];
  /** Calendar display name (X-WR-CALNAME). */
  calName: string;
  /** Calendar timezone identifier (X-WR-TIMEZONE). Informational only — we
   *  emit floating local times so this doesn't affect DTSTART. */
  tzid: string;
  /** Optional PRODID override. Default: "-//College OS//EN". */
  prodId?: string;
}

// ───────────────────────────── helpers ─────────────────────────────

/** RFC 5545 §3.3.11 TEXT escaping: \\ \; \, \n. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format a Date as a local-time DATE-TIME: "20260827T093000" (no Z, no TZID). */
function fmtLocal(d: Date): string {
  return (
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0") +
    "T" +
    d.getHours().toString().padStart(2, "0") +
    d.getMinutes().toString().padStart(2, "0") +
    d.getSeconds().toString().padStart(2, "0")
  );
}

/** Format a Date as a UTC DATE-TIME: "20260827T033000Z". */
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

/** Format a Date as a DATE (all-day): "20260827". */
function fmtDate(d: Date): string {
  return (
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0")
  );
}

/**
 * RFC 5545 §3.1 line folding: max 75 octets per line, with continuation
 * lines starting with a single space. Operates on UTF-8 bytes so a
 * multi-byte character is never split across two lines.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf-8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let end = Math.min(i + 75, bytes.length);
    // Back off to a UTF-8 char boundary if we'd split a multi-byte sequence.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    const slice = bytes.slice(i, end).toString("utf-8");
    out.push(i === 0 ? slice : " " + slice);
    i = end;
  }
  return out.join("\r\n");
}

/** Stable UID derived from the source row and a per-occurrence bucket. */
export function stableUid(source: IcsSource, key: string): string {
  return (
    createHash("sha1").update(`college-os:${source}:${key}`).digest("hex") +
    "@college.os"
  );
}

// ─────────────────────────── public API ────────────────────────────

export function buildIcsFeed(input: IcsFeedInput): string {
  const prodId = input.prodId ?? "-//College OS//EN";
  const now = new Date();

  // VCALENDAR wrapper + header properties.
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escapeText(input.calName)}`),
    `X-WR-TIMEZONE:${escapeText(input.tzid)}`,
  ];

  for (const ev of input.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${fmtUtc(now)}`);

    if (ev.allDay) {
      // All-day events use VALUE=DATE; DTEND is exclusive (next day).
      const endExclusive = new Date(ev.end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.start)}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${fmtLocal(ev.start)}`);
      lines.push(`DTEND:${fmtLocal(ev.end)}`);
    }

    lines.push(fold(`SUMMARY:${escapeText(ev.summary)}`));

    if (ev.description) {
      lines.push(fold(`DESCRIPTION:${escapeText(ev.description)}`));
    }
    if (ev.location) {
      lines.push(fold(`LOCATION:${escapeText(ev.location)}`));
    }

    // CATEGORIES helps calendar clients group/tint by source.
    lines.push(`CATEGORIES:${ev.source}`);

    // Apple Calendar reads X-APPLE-CALENDAR-COLOR for per-event tint.
    if (ev.color) {
      const hex = ev.color.replace(/^#/, "").toUpperCase();
      lines.push(`X-APPLE-CALENDAR-COLOR:${hex}`);
    }

    if (ev.rrule) {
      lines.push(`RRULE:${ev.rrule}`);
    }

    lines.push(`LAST-MODIFIED:${fmtUtc(ev.lastModified ?? now)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF and a single trailing CRLF.
  return lines.join("\r\n") + "\r\n";
}
