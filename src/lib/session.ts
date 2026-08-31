import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifyToken } from "./auth";

export const AUTH_COOKIE = "college_os_token";

export async function getCurrentUser() {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { student: true },
  });
  return user;
}
