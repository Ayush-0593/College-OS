import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/requireUser";
import { fire, getPrefs, prefAllows } from "@/lib/notifications";

const CATEGORIES = [
  "Academic",
  "Examination",
  "Events",
  "Fees",
  "Placement",
  "Holiday",
  "Emergency",
];

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const notices = await prisma.notice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notices });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = auth.ctx;

  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return jsonError("Notice title is required.");

  const category = CATEGORIES.includes(body.category) ? body.category : "Academic";

  const notice = await prisma.notice.create({
    data: {
      userId,
      title,
      body: body.body ? String(body.body).trim() : null,
      category,
      source: body.source ? String(body.source).trim() : null,
    },
  });

  // §17 — fire an in-app notification for the new notice. Gated by the
  // user's noticeNew pref so a user with the category disabled doesn't see
  // their own notices light up the bell. Awaited (not backgrounded) so the
  // response after a successful POST sees the notification in the bell on
  // the next render.
  const prefs = await getPrefs(userId);
  if (prefAllows(prefs, "notice_new")) {
    const bodyParts: string[] = [];
    if (notice.source) bodyParts.push(notice.source);
    bodyParts.push(notice.category);
    await fire(userId, [
      {
        kind: "notice_new",
        title: `New notice: ${notice.title}`,
        body: bodyParts.join(" · "),
        href: "/notices",
        sourceId: notice.id,
        // dedup default = dateKey(today) — one notification per notice per day.
      },
    ]);
  }

  return NextResponse.json({ notice }, { status: 201 });
}
