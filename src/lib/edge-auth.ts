// Edge-runtime JWT helpers. Uses `jose` because `jsonwebtoken` is Node-only
// and middleware runs on the Edge. Signing still uses `jsonwebtoken` in
// Node-only code paths; we only need to *verify* here.

import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "college-os-dev-secret-change-me";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

export interface EdgeTokenPayload {
  userId: string;
  email: string;
}

export async function verifyTokenEdge(
  token: string
): Promise<EdgeTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}
