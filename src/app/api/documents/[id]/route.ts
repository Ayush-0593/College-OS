// §11 — Single document: metadata + delete.
// Always scoped to userId so a caller can never read or remove another
// user's document even if they guess the id.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { deleteFileSafe } from "@/lib/documents";

async function findOwned(id: string, userId: string) {
  return prisma.document.findFirst({ where: { id, userId } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const document = await findOwned(params.id, userId);
  if (!document) return jsonError("Document not found.", 404);
  return NextResponse.json({ document });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const document = await findOwned(params.id, userId);
  if (!document) return jsonError("Document not found.", 404);

  // Remove the row first, then the file. If the file delete fails
  // (e.g. already gone) we still consider the operation a success —
  // the file is gone from the user's perspective either way.
  await prisma.document.delete({ where: { id: document.id } });
  if (document.storagePath) {
    await deleteFileSafe(document.storagePath).catch((err) => {
      console.error("[/api/documents/[id]] file delete failed", err);
    });
  }
  return NextResponse.json({ ok: true });
}
