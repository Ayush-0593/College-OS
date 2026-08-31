// Smoke-test fixtures: ensure the demo user has data that will trigger
// each of the three notification types. The real seed is frozen in time and
// its attendance/assignment state has drifted, so we re-prime here.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const user = await p.user.findUnique({
    where: { email: "demo@college.os" },
    include: { subjects: true },
  });
  if (!user) {
    console.error("demo user missing");
    process.exit(1);
  }
  const byName = (n) => user.subjects.find((s) => s.name === n);

  // Wipe the user's existing notifications + any non-submitted assignments
  // so the test starts from a known state.
  await p.notification.deleteMany({ where: { userId: user.id } });
  await p.assignment.deleteMany({
    where: { userId: user.id, status: { not: "submitted" } },
  });

  // 1. Assignment due tomorrow, not submitted.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);
  await p.assignment.create({
    data: {
      userId: user.id,
      subjectId: byName("Data Structures").id,
      title: "Binary Tree Assignment",
      description: "Implement BST operations.",
      professor: "Dr. Rao",
      dueDate: tomorrow,
      priority: "high",
      status: "in_progress",
    },
  });

  // 2. Drop OS attendance to a "critical" level (19/30 = 63.3% < 65% thr-10).
  await p.attendance.update({
    where: { subjectId: byName("Operating Systems").id },
    data: { total: 30, attended: 19 },
  });
  // 3. Drop Cyber Security to "warning" (21/30 = 70% < 75% but > 65%).
  await p.attendance.update({
    where: { subjectId: byName("Cyber Security").id },
    data: { total: 30, attended: 21 },
  });

  console.log("Fixtures inserted.");
  await p.$disconnect();
})();
