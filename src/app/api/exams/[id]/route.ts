import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { combineDateTime } from "@/lib/dates";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.exam.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Exam not found.", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.subjectId !== undefined) data.subjectId = body.subjectId || null;
  if (body.date !== undefined)
    data.date = combineDateTime(String(body.date), body.time ? to24(body.time) : undefined);
  if (body.time !== undefined) data.time = String(body.time).trim() || null;
  if (body.syllabus !== undefined) data.syllabus = body.syllabus ?? null;
  if (body.prepPercent !== undefined) data.prepPercent = Number(body.prepPercent);

  const exam = await prisma.exam.update({
    where: { id: params.id },
    data,
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ exam });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.exam.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Exam not found.", 404);

  await prisma.exam.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
