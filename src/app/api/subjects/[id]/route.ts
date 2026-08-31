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

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Subject not found.", 404);

  const body = await req.json();
  const subject = await prisma.subject.update({
    where: { id: params.id },
    data: {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      code: body.code !== undefined ? String(body.code).trim() || null : undefined,
      faculty:
        body.faculty !== undefined ? String(body.faculty).trim() || null : undefined,
      color: body.color !== undefined ? String(body.color).trim() || null : undefined,
    },
  });
  return NextResponse.json({ subject });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Subject not found.", 404);

  await prisma.subject.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
