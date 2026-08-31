import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.timetableEntry.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Entry not found.", 404);

  const body = await req.json();
  const entry = await prisma.timetableEntry.update({
    where: { id: params.id },
    data: {
      subjectId: body.subjectId !== undefined ? body.subjectId || null : undefined,
      day: body.day !== undefined ? Number(body.day) : undefined,
      start: body.start !== undefined ? String(body.start) : undefined,
      end: body.end !== undefined ? String(body.end) : undefined,
      room: body.room !== undefined ? String(body.room).trim() || null : undefined,
      type: body.type !== undefined ? String(body.type) : undefined,
      label: body.label !== undefined ? String(body.label).trim() || null : undefined,
    },
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ entry });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.timetableEntry.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Entry not found.", 404);

  await prisma.timetableEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
