// §22 — Auth-gated ICS feed. Returns a single combined calendar of the
// user's timetable, assignments (excluding submitted), and exams, covering
// a rolling 30-day-past / 365-day-future window.
//
// Subscribe from any RFC 5545 client (iOS Calendar, Google Calendar,
// Outlook) using the `/api/calendar.ics` URL. Events are emitted as
// floating local times (no VTIMEZONE) so the client shows them in the
// user's local zone without needing DST rules.
//
// v1 uses `now + 365 days` as the RRULE UNTIL. v2 will swap in
// `student.semesterEnd` once the user provides one.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { buildAgenda, buildIcsEvents } from "@/lib/calendarView";
import { buildIcsFeed } from "@/lib/ics";
import { addDays, startOfDay } from "@/lib/dates";

// Per-user, dynamic — never cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { ctx } = auth;

  // Wide window for the feed (past 30 days for "what did I miss" support;
  // 365 days forward for the full rolling year of recurring classes).
  const agenda = await buildAgenda(ctx.userId, { fromDays: -30, toDays: 365 });
  const now = new Date();
  const until = startOfDay(addDays(now, 365));

  const events = buildIcsEvents(agenda, { until, now });

  // Server's local timezone — used in the X-WR-TIMEZONE header for
  // informational purposes. Floating DTSTARTs are interpreted by the
  // client in *its* local zone, which is what we want.
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const ics = buildIcsFeed({
    events,
    calName: `College OS — ${ctx.user.name ?? "You"}`,
    tzid,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="college-os.ics"',
      // Per-user feed; must not be cached by any intermediate proxy.
      "Cache-Control": "private, no-store",
    },
  });
}
