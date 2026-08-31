import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";
import { dayIndex, nowMinutes, toMinutes } from "@/lib/dates";
import { attendanceInsight } from "@/lib/attendance";

const MS_DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const now = new Date();
  const todayIdx = dayIndex(now);

  const [timetable, assignments, exams, attendance, notices, subjects] =
    await Promise.all([
      prisma.timetableEntry.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
      }),
      prisma.assignment.findMany({
        where: { userId, status: { not: "submitted" } },
        include: { subject: { select: { id: true, name: true, color: true } } },
      }),
      prisma.exam.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
      }),
      prisma.attendance.findMany({
        where: { userId },
        include: { subject: { select: { id: true, name: true, color: true } } },
      }),
      prisma.notice.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subject.count({ where: { userId } }),
    ]);

  // Today's schedule
  const todaysClasses = timetable
    .filter((t) => t.day === todayIdx)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .map((t) => ({
      id: t.id,
      title: t.type === "break" ? t.label || "Break" : t.subject?.name || t.label || "Class",
      subject: t.subject?.name || null,
      color: t.subject?.color || null,
      room: t.room,
      start: t.start,
      end: t.end,
      type: t.type,
    }));

  // Next class (today after now, else first class tomorrow)
  let nextClass: (typeof todaysClasses)[number] | null = null;
  const upcomingToday = todaysClasses.filter(
    (c) => c.type !== "break" && toMinutes(c.start) >= nowMinutes()
  );
  if (upcomingToday.length > 0) {
    nextClass = upcomingToday[0];
  } else {
    const tomorrowIdx = (todayIdx + 1) % 7;
    const tomorrowClasses = timetable
      .filter((t) => t.day === tomorrowIdx)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const first = tomorrowClasses.find((t) => t.type !== "break");
    if (first) {
      nextClass = {
        id: first.id,
        title: first.type === "break" ? first.label || "Break" : first.subject?.name || first.label || "Class",
        subject: first.subject?.name || null,
        color: first.subject?.color || null,
        room: first.room,
        start: first.start,
        end: first.end,
        type: first.type,
      };
    }
  }

  // Upcoming deadlines (next 7 days, not submitted)
  const deadlines = assignments
    .filter((a) => a.dueDate.getTime() >= now.getTime())
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject?.name || null,
      color: a.subject?.color || null,
      priority: a.priority,
      dueDate: a.dueDate,
      daysLeft: Math.ceil((a.dueDate.getTime() - now.getTime()) / MS_DAY),
    }));

  const deadlinesToday = assignments.filter(
    (a) => a.dueDate.getTime() >= now.getTime() && a.dueDate.getTime() < now.getTime() + MS_DAY
  ).length;

  // Upcoming exams (future)
  const upcomingExams = exams
    .filter((e) => e.date.getTime() >= now.getTime() - MS_DAY)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject?.name || null,
      color: e.subject?.color || null,
      date: e.date,
      time: e.time,
      prepPercent: e.prepPercent,
      daysLeft: Math.ceil((e.date.getTime() - now.getTime()) / MS_DAY),
    }));

  // Attendance overview
  const attendanceOverview = attendance.map((a) => {
    const ins = attendanceInsight(a.total, a.attended, a.threshold);
    return {
      id: a.id,
      subject: a.subject?.name || "Subject",
      color: a.subject?.color || null,
      total: a.total,
      attended: a.attended,
      threshold: a.threshold,
      ...ins,
    };
  });
  const avgAttendance =
    attendanceOverview.length > 0
      ? Math.round(
          attendanceOverview.reduce((s, a) => s + a.percent, 0) /
            attendanceOverview.length
        )
      : null;

  const pendingTasks = assignments.length;

  return NextResponse.json({
    today: {
      label: todayIdx,
      classes: todaysClasses,
      nextClass,
      deadlinesToday,
      deadlines,
      pendingTasks,
    },
    upcomingExams,
    attendance: { overview: attendanceOverview, avg: avgAttendance },
    notices: notices.slice(0, 5).map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      createdAt: n.createdAt,
    })),
    counts: {
      subjects,
      assignments: assignments.length,
      exams: exams.length,
      attendance: attendance.length,
      notices: notices.length,
    },
  });
}
