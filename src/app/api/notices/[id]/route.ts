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

  const existing = await prisma.notice.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Notice not found.", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.body !== undefined) data.body = String(body.body).trim() || null;
  if (body.category !== undefined) data.category = String(body.category);
  if (body.source !== undefined) data.source = String(body.source).trim() || null;
  if (body.isRead !== undefined) data.isRead = Boolean(body.isRead);

  const notice = await prisma.notice.update({ where: { id: params.id }, data });
  return NextResponse.json({ notice });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const existing = await prisma.notice.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return jsonError("Notice not found.", 404);

  await prisma.notice.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
