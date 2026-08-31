import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { combineDateTime } from "@/lib/dates";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const assignments = await prisma.assignment.findMany({
    where: { userId },
    include: { subject: { select: { id: true, name: true, color: true } } },
    orderBy: { dueDate: "asc" },
  });
  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return jsonError("Assignment title is required.");
  if (!body.dueDate) return jsonError("Due date is required.");

  const dueDate = combineDateTime(String(body.dueDate), body.dueTime || "23:59");
  const assignment = await prisma.assignment.create({
    data: {
      userId,
      subjectId: body.subjectId || null,
      title,
      description: body.description ? String(body.description).trim() : null,
      professor: body.professor ? String(body.professor).trim() : null,
      dueDate,
      priority: body.priority || "medium",
      status: body.status || "not_started",
    },
    include: { subject: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ assignment }, { status: 201 });
}
