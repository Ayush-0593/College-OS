// §14 — Mark notifications as read.
//   POST /api/notifications/mark-read
//   body: { ids: string[] }  — mark specific rows
//   body: { all: true }      — mark every unread row for the caller

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body.");

  if (body.all === true) {
    const { count } = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true, count });
  }

  if (Array.isArray(body.ids) && body.ids.every((x: unknown) => typeof x === "string")) {
    if (body.ids.length === 0) return NextResponse.json({ ok: true, count: 0 });
    const { count } = await prisma.notification.updateMany({
      where: { userId, id: { in: body.ids as string[] } },
      data: { read: true },
    });
    return NextResponse.json({ ok: true, count });
  }

  return jsonError("Body must be { ids: string[] } or { all: true }.");
}
