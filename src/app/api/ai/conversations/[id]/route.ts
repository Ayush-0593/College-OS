// §12 — Single conversation: read its messages, or delete the conversation.
// The id segment is always scoped to the calling userId so a caller can
// never read or delete another user's conversation.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const convo = await prisma.aiConversation.findFirst({
    where: { id: params.id, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!convo) return jsonError("Conversation not found.", 404);
  return NextResponse.json({ conversation: convo });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const convo = await prisma.aiConversation.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!convo) return jsonError("Conversation not found.", 404);

  await prisma.aiConversation.delete({ where: { id: convo.id } });
  return NextResponse.json({ ok: true });
}
