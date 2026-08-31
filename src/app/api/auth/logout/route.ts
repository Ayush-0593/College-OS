import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/session";

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
