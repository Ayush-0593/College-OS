// §19 — Lightweight "is the AI configured?" probe for the client.
// Returns { configured: boolean }. Auth-required so an unauthenticated probe
// doesn't leak server state (whether the key is set is itself a server fact).

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { isAiConfigured } from "@/lib/ai/client";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ configured: isAiConfigured() });
}
