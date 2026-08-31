import { getCurrentUser } from "./session";

export interface AuthContext {
  userId: string;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
}

/** For API routes: resolve the logged-in user or return an error response. */
export async function requireUser(): Promise<
  { ctx: AuthContext } | { error: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  return { ctx: { userId: user.id, user } };
}

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
