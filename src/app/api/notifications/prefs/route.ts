// §14 — Per-user notification preferences.
//   GET  /api/notifications/prefs
//   PATCH /api/notifications/prefs  body: { classSoon?, dueTomorrow?, attendanceLow? }

import { NextRequest, NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/requireUser";
import { getPrefs, setPrefs, type NotificationPrefs } from "@/lib/notifications";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;
  const prefs = await getPrefs(userId);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const patch: Partial<NotificationPrefs> = {};
  if ("classSoon" in body) {
    if (typeof body.classSoon !== "boolean") return jsonError("classSoon must be boolean.");
    patch.classSoon = body.classSoon;
  }
  if ("dueTomorrow" in body) {
    if (typeof body.dueTomorrow !== "boolean") return jsonError("dueTomorrow must be boolean.");
    patch.dueTomorrow = body.dueTomorrow;
  }
  if ("attendanceLow" in body) {
    if (typeof body.attendanceLow !== "boolean") return jsonError("attendanceLow must be boolean.");
    patch.attendanceLow = body.attendanceLow;
  }
  if ("examSoon" in body) {
    if (typeof body.examSoon !== "boolean") return jsonError("examSoon must be boolean.");
    patch.examSoon = body.examSoon;
  }
  if ("noticeNew" in body) {
    if (typeof body.noticeNew !== "boolean") return jsonError("noticeNew must be boolean.");
    patch.noticeNew = body.noticeNew;
  }
  if ("morningDigest" in body) {
    if (typeof body.morningDigest !== "boolean") return jsonError("morningDigest must be boolean.");
    patch.morningDigest = body.morningDigest;
  }
  if ("eveningDigest" in body) {
    if (typeof body.eveningDigest !== "boolean") return jsonError("eveningDigest must be boolean.");
    patch.eveningDigest = body.eveningDigest;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("No known preference keys in body.");
  }

  const prefs = await setPrefs(userId, patch);
  return NextResponse.json({ prefs });
}
