// §14 — Dev-only: force a single scheduler tick for the caller.
//   POST /api/dev/tick
//   POST /api/dev/tick?force=morning   — §18: force a morning roll-up (bypasses
//                                          the 6–7 AM time-of-day gate, but
//                                          still respects the pref toggle)
//   POST /api/dev/tick?force=evening   — same, for the 8–9 PM roll-up
//
// Returns the items the tick considered (so the smoke test can assert
// without scraping the DB). 404s in production so this can never be hit
// from a deployed build.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/requireUser";
import {
  attendanceInsight,
  type AttendanceInsight,
} from "@/lib/attendance";
import { dayIndex, minutesUntil } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  fire,
  getPrefs,
  prefAllows,
  type NotificationItem,
} from "@/lib/notifications";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  // §18 — manual roll-up trigger for the smoke test. Bypasses the
  // time-of-day gate (so the test isn't tied to wall-clock) but the pref
  // toggle is still honored: turning morningDigest off will suppress the
  // force-fired roll-up.
  const force = new URL(req.url).searchParams.get("force");

  const prefs = await getPrefs(userId);
  const considered: { kind: string; title: string; sourceId: string | null }[] = [];
  const items: NotificationItem[] = [];

  if (prefAllows(prefs, "class_soon")) {
    const todayIdx = dayIndex(new Date());
    const entries = await prisma.timetableEntry.findMany({
      where: { userId, day: todayIdx, type: "class" },
      include: { subject: { select: { name: true } } },
    });
    for (const e of entries) {
      if (!e.subject) continue;
      const mins = minutesUntil(e.start, 0);
      if (mins < 29 || mins > 31) continue;
      items.push({
        kind: "class_soon",
        title: `${e.subject.name} in 30 min`,
        body: `${e.start}${e.room ? ` · Room ${e.room}` : ""}`,
        href: "/timetable",
        sourceId: e.id,
      });
      considered.push({ kind: "class_soon", title: e.subject.name, sourceId: e.id });
    }
  }

  if (prefAllows(prefs, "due_tomorrow")) {
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
    for (const a of assignments) {
      items.push({
        kind: "due_tomorrow",
        title: `${a.title} due tomorrow`,
        body: a.subject?.name ?? null,
        href: "/assignments",
        sourceId: a.id,
        date: start.toISOString().slice(0, 10),
      });
      considered.push({ kind: "due_tomorrow", title: a.title, sourceId: a.id });
    }
  }

  if (prefAllows(prefs, "attendance_low")) {
    const rows = await prisma.attendance.findMany({
      where: { userId },
      include: { subject: { select: { name: true } } },
    });
    for (const r of rows) {
      const ins: AttendanceInsight = attendanceInsight(r.total, r.attended, r.threshold);
      if (ins.status === "good") continue;
      items.push({
        kind: "attendance_low",
        title: `${r.subject?.name ?? "Subject"} attendance at ${Math.round(ins.percent)}%`,
        body:
          ins.status === "critical"
            ? `Attend the next ${ins.needToAttend} to reach ${r.threshold}%`
            : `Stay above ${r.threshold}% — only ${ins.canMiss} can be missed`,
        href: "/attendance",
        sourceId: r.subjectId,
      });
      considered.push({ kind: "attendance_low", title: r.subject?.name ?? "Subject", sourceId: r.subjectId });
    }
  }

  if (prefAllows(prefs, "exam_soon")) {
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
    for (const e of exams) {
      const examDay = new Date(e.date);
      examDay.setHours(0, 0, 0, 0);
      const daysUntil = Math.round(
        (examDay.getTime() - today.getTime()) / 86_400_000
      );
      const proximity =
        daysUntil === 0
          ? `today${e.time ? ` at ${e.time}` : ""}`
          : daysUntil === 1
          ? "tomorrow"
          : `in ${daysUntil} days`;
      items.push({
        kind: "exam_soon",
        title: `${e.title} ${proximity}`,
        body: e.subject?.name ?? "Subject",
        href: "/exams",
        sourceId: e.id,
        date: today.toISOString().slice(0, 10),
      });
      considered.push({ kind: "exam_soon", title: e.title, sourceId: e.id });
    }
  }

  // §18 — Manual roll-up trigger. The dev/tick does NOT enforce the
  // time-of-day window (the caller is asking to force it), but it DOES honor
  // the pref toggle. Empty roll-ups (all four counts zero) are silently
  // dropped — the smoke test asserts on a non-empty body.
  if (force === "morning" && prefAllows(prefs, "morning_digest")) {
    const rollup = await buildRollup(userId, "morning");
    if (rollup) {
      items.push(rollup.item);
      considered.push({
        kind: "morning_digest",
        title: rollup.item.title,
        sourceId: rollup.item.sourceId ?? null,
      });
    }
  }
  if (force === "evening" && prefAllows(prefs, "evening_digest")) {
    const rollup = await buildRollup(userId, "evening");
    if (rollup) {
      items.push(rollup.item);
      considered.push({
        kind: "evening_digest",
        title: rollup.item.title,
        sourceId: rollup.item.sourceId ?? null,
      });
    }
  }

  let fired = 0;
  if (items.length > 0) {
    fired = await fire(userId, items);
  }

  return NextResponse.json({ considered, fired });
}

/**
 * §18 — Build a single roll-up item for the dev/tick route. Mirrors
 * `tickRollup` in `src/lib/scheduler.ts`. Returns `null` if all four counts
 * are zero (we don't fire empty roll-ups).
 *
 * Kept inline here rather than imported from the scheduler because the
 * scheduler's `tickRollup` is intentionally not exported — the dev/tick
 * mirrors the polled logic (see class_soon, due_tomorrow, etc. above) and
 * the duplication is bounded to ~30 lines.
 */
async function buildRollup(
  userId: string,
  period: "morning" | "evening"
): Promise<{ item: NotificationItem } | null> {
  const kind = period === "morning" ? "morning_digest" : "evening_digest";
  const now = new Date();
  const todayIdx = dayIndex(now);

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

  if (classCount === 0 && dueCount === 0 && lowAttCount === 0 && noticeCount === 0) {
    return null;
  }

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

  return {
    item: {
      kind,
      title: period === "morning" ? "Morning brief" : "Evening brief",
      body: parts.join(" · "),
      href: "/dashboard",
      sourceId: period,
    },
  };
}
