import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { combineDateTime } from "@/lib/dates";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.assignment.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Assignment not found.", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.subjectId !== undefined) data.subjectId = body.subjectId || null;
  if (body.description !== undefined)
    data.description = String(body.description).trim() || null;
  if (body.professor !== undefined)
    data.professor = String(body.professor).trim() || null;
  if (body.priority !== undefined) data.priority = String(body.priority);
  if (body.status !== undefined) data.status = String(body.status);
  if (body.dueDate !== undefined)
    data.dueDate = combineDateTime(String(body.dueDate), body.dueTime || "23:59");

  const assignment = await prisma.assignment.update({
    where: { id: params.id },
    data,
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ assignment });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.assignment.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Assignment not found.", 404);

  await prisma.assignment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
