import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/requireUser";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth.ctx;

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      student: user.student,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const name = body.name ? String(body.name).trim() : undefined;

  await prisma.user.update({
    where: { id: userId },
    data: { name: name || undefined },
  });

  if (body.student) {
    const s = body.student;
    await prisma.student.upsert({
      where: { userId },
      create: {
        userId,
        course: s.course ?? null,
        semester: s.semester ?? 3,
        cgpa: s.cgpa ?? 0,
        collegeName: s.collegeName ?? null,
        department: s.department ?? null,
      },
      update: {
        course: s.course !== undefined ? s.course : undefined,
        semester: s.semester !== undefined ? Number(s.semester) : undefined,
        cgpa: s.cgpa !== undefined ? Number(s.cgpa) : undefined,
        collegeName: s.collegeName !== undefined ? s.collegeName : undefined,
        department: s.department !== undefined ? s.department : undefined,
      },
    });
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: true },
  });
  return NextResponse.json({
    user: {
      id: updated!.id,
      name: updated!.name,
      email: updated!.email,
      student: updated!.student,
    },
  });
}
