import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, tokenMaxAgeSeconds } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const course = body.course ? String(body.course).trim() : null;
    const semester = body.semester ? Number(body.semester) : 3;

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Name, email and password are required." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        student: {
          create: { course, semester },
        },
      },
      include: { student: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    const res = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, student: user.student },
    });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: tokenMaxAgeSeconds(),
    });
    return res;
  } catch (err) {
    console.error("register error", err);
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}
