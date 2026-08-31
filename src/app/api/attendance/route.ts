import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const attendance = await prisma.attendance.findMany({
    where: { userId },
    include: { subject: { select: { id: true, name: true, color: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  return NextResponse.json({ attendance });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const subjectId = body.subjectId ? String(body.subjectId) : null;
  const total = Number(body.total ?? 0);
  const attended = Number(body.attended ?? 0);
  const threshold = Number(body.threshold ?? 75);

  if (!subjectId) return jsonError("Subject is required.");

  const existing = await prisma.attendance.findUnique({ where: { subjectId } });
  if (existing) {
    return jsonError("Attendance for this subject already exists. Edit it instead.", 409);
  }

  const record = await prisma.attendance.create({
    data: { userId, subjectId, total, attended, threshold },
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ record }, { status: 201 });
}
