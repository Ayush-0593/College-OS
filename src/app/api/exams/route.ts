import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { combineDateTime } from "@/lib/dates";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const exams = await prisma.exam.findMany({
    where: { userId },
    include: { subject: { select: { id: true, name: true, color: true } } },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ exams });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return jsonError("Exam title is required.");
  if (!body.date) return jsonError("Exam date is required.");
  if (!body.subjectId) return jsonError("Subject is required.");

  const date = combineDateTime(String(body.date), body.time ? to24(body.time) : undefined);
  const exam = await prisma.exam.create({
    data: {
      userId,
      subjectId: body.subjectId,
      title,
      date,
      time: body.time ? String(body.time).trim() : null,
      syllabus: body.syllabus ? String(body.syllabus) : null,
      prepPercent: Number(body.prepPercent ?? 0),
    },
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ exam }, { status: 201 });
}

// Convert "10:00 AM" style to "10:00" for Date combination.
function to24(twelve: string): string {
  const m = twelve.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return "09:00";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}
