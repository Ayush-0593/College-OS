import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const entries = await prisma.timetableEntry.findMany({
    where: { userId },
    include: { subject: { select: { id: true, name: true, color: true } } },
    orderBy: [{ day: "asc" }, { start: "asc" }],
  });
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const day = Number(body.day);
  const start = String(body.start || "");
  const end = String(body.end || "");
  if (Number.isNaN(day) || day < 0 || day > 6) return jsonError("Valid day is required.");
  if (!start || !end) return jsonError("Start and end times are required.");

  const entry = await prisma.timetableEntry.create({
    data: {
      userId,
      subjectId: body.subjectId || null,
      day,
      start,
      end,
      room: body.room ? String(body.room).trim() : null,
      type: body.type || "class",
      label: body.label ? String(body.label).trim() : null,
    },
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
