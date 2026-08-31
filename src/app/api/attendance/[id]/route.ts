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

  const existing = await prisma.attendance.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Record not found.", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.total !== undefined) data.total = Number(body.total);
  if (body.attended !== undefined) data.attended = Number(body.attended);
  if (body.threshold !== undefined) data.threshold = Number(body.threshold);

  const record = await prisma.attendance.update({
    where: { id: params.id },
    data,
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ record });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.attendance.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Record not found.", 404);

  await prisma.attendance.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
