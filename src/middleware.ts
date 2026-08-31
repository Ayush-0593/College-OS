import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/edge-auth";

const AUTH_COOKIE = "college_os_token";

// Routes that require a logged-in session.
const PROTECTED = ["/dashboard", "/timetable", "/assignments", "/exams", "/attendance", "/notices", "/profile"];

// Routes only for logged-out users (redirect to dashboard if logged in).
const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const user = token ? await verifyTokenEdge(token) : null;

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/timetable/:path*",
    "/assignments/:path*",
    "/exams/:path*",
    "/attendance/:path*",
    "/notices/:path*",
    "/profile/:path*",
    "/login",
    "/register",
  ],
};
