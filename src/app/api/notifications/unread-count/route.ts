// §14 — Cheap unread count for the bell's poll.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const count = await prisma.notification.count({
    where: { userId, read: false },
  });
  return NextResponse.json({ count });
}
