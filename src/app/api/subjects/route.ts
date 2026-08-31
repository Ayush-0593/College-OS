import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const subjects = await prisma.subject.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ subjects });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return jsonError("Subject name is required.");

  const subject = await prisma.subject.create({
    data: {
      userId,
      name,
      code: body.code ? String(body.code).trim() : null,
      faculty: body.faculty ? String(body.faculty).trim() : null,
      color: body.color ? String(body.color).trim() : null,
    },
  });
  return NextResponse.json({ subject }, { status: 201 });
}
