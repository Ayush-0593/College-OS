import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { combineDateTime } from "../src/lib/dates";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@college.os";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed user already exists, skipping.");
    return;
  }

  const password = await hashPassword("demo1234");
  const user = await prisma.user.create({
    data: {
      email,
      name: "Ayush Pawar",
      password,
      student: {
        create: {
          course: "B.Tech CSE",
          semester: 3,
          cgpa: 7.4,
          collegeName: "Demo University",
          department: "Computer Science",
          streak: 5,
        },
      },
    },
  });

  const subjects = await Promise.all(
    [
      { name: "Data Structures", code: "CS301", faculty: "Dr. Rao", color: "#3b62f0" },
      { name: "Operating Systems", code: "CS302", faculty: "Dr. Sharma", color: "#16a34a" },
      { name: "DBMS", code: "CS303", faculty: "Prof. Iyer", color: "#db2777" },
      { name: "Cyber Security", code: "CS304", faculty: "Dr. Menon", color: "#ea580c" },
      { name: "Mathematics", code: "MA301", faculty: "Prof. Nair", color: "#7c3aed" },
    ].map((s) =>
      prisma.subject.create({ data: { userId: user.id, ...s } })
    )
  );

  const byName = (n: string) => subjects.find((s) => s.name === n)!;

  // Timetable (Monday = 0)
  const tt: Array<[number, string, string, string?, string?]> = [
    [0, "09:00", "10:00", "DBMS"],
    [0, "10:00", "11:00", "Data Structures"],
    [0, "11:00", "12:00", "Mathematics"],
    [0, "12:00", "13:00", undefined, "break"],
    [0, "13:00", "14:00", "Operating Systems"],
    [0, "14:00", "15:00", "Cyber Security"],
    [1, "09:00", "10:00", "Data Structures"],
    [1, "10:00", "11:00", "DBMS"],
    [1, "11:00", "12:00", "Operating Systems"],
    [1, "12:00", "13:00", undefined, "break"],
    [1, "13:00", "14:00", "Mathematics"],
    [2, "09:00", "10:00", "Cyber Security"],
    [2, "10:00", "11:00", "DBMS"],
    [2, "11:00", "12:00", "Data Structures"],
    [2, "12:00", "13:00", undefined, "break"],
    [2, "13:00", "14:00", "Operating Systems"],
    [3, "09:00", "10:00", "Mathematics"],
    [3, "10:00", "11:00", "DBMS"],
    [3, "11:00", "12:00", "Cyber Security"],
    [3, "12:00", "13:00", undefined, "break"],
    [3, "13:00", "14:00", "Data Structures"],
    [4, "09:00", "10:00", "Operating Systems"],
    [4, "10:00", "11:00", "Cyber Security"],
    [4, "11:00", "12:00", "DBMS"],
    [4, "12:00", "13:00", undefined, "break"],
    [4, "13:00", "14:00", "Mathematics"],
  ];
  for (const [day, start, end, subj, type] of tt) {
    await prisma.timetableEntry.create({
      data: {
        userId: user.id,
        subjectId: subj ? byName(subj).id : null,
        day,
        start,
        end,
        type: type || "class",
        label: type === "break" ? "Break" : null,
        room: subj ? `AB-${200 + day * 4}` : null,
      },
    });
  }

  // Assignments (relative to today so deadlines show up soon)
  const today = new Date();
  const inDays = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x;
  };
  await Promise.all(
    [
      { subject: "Data Structures", title: "Binary Tree Assignment", desc: "Implement BST operations.", prof: "Dr. Rao", due: inDays(1), prio: "high", status: "in_progress" },
      { subject: "DBMS", title: "Normalization Exercise", desc: "Convert to 3NF.", prof: "Prof. Iyer", due: inDays(2), prio: "medium", status: "not_started" },
      { subject: "Operating Systems", title: "Deadlock Case Study", desc: "Analyze the dining philosophers.", prof: "Dr. Sharma", due: inDays(4), prio: "high", status: "not_started" },
      { subject: "Cyber Security", title: "Cryptography Report", desc: "AES vs RSA.", prof: "Dr. Menon", due: inDays(7), prio: "low", status: "not_started" },
      { subject: "Mathematics", title: "Numerical Methods Sheet", desc: "Problems 1-10.", prof: "Prof. Nair", due: inDays(-2), prio: "medium", status: "submitted" },
    ].map((a) =>
      prisma.assignment.create({
        data: {
          userId: user.id,
          subjectId: byName(a.subject).id,
          title: a.title,
          description: a.desc,
          professor: a.prof,
          dueDate: combineDateTime(a.due.toISOString().slice(0, 10), "23:59"),
          priority: a.prio,
          status: a.status,
        },
      })
    )
  );

  // Exams — syllabus is stored as JSON `[{text, done}]` (§9 follow-up).
  const syllabusJson = (lines: string[]) =>
    JSON.stringify(lines.map((text) => ({ text, done: false })));
  await Promise.all(
    [
      { subject: "Data Structures", title: "DS Mid-Term", date: inDays(3), time: "10:00 AM", prep: 45, syllabus: syllabusJson(["Trees", "Graphs", "Sorting", "Hashing"]) },
      { subject: "Operating Systems", title: "OS Mid-Term", date: inDays(6), time: "2:00 PM", prep: 62, syllabus: syllabusJson(["Process Management", "Scheduling", "Deadlocks", "Memory Management"]) },
      { subject: "Cyber Security", title: "CS Quiz", date: inDays(10), time: "10:00 AM", prep: 20, syllabus: syllabusJson(["Symmetric Crypto", "Asymmetric Crypto", "Hashing"]) },
    ].map((e) =>
      prisma.exam.create({
        data: {
          userId: user.id,
          subjectId: byName(e.subject).id,
          title: e.title,
          date: combineDateTime(e.date.toISOString().slice(0, 10), e.time ? "09:00" : undefined),
          time: e.time,
          syllabus: e.syllabus,
          prepPercent: e.prep,
        },
      })
    )
  );

  // Attendance
  await Promise.all(
    [
      { subject: "Data Structures", total: 30, attended: 27, threshold: 75 },
      { subject: "Operating Systems", total: 28, attended: 21, threshold: 75 },
      { subject: "DBMS", total: 32, attended: 30, threshold: 75 },
      { subject: "Cyber Security", total: 25, attended: 18, threshold: 75 },
      { subject: "Mathematics", total: 30, attended: 24, threshold: 75 },
    ].map((a) =>
      prisma.attendance.create({
        data: {
          userId: user.id,
          subjectId: byName(a.subject).id,
          total: a.total,
          attended: a.attended,
          threshold: a.threshold,
        },
      })
    )
  );

  // Notices
  await Promise.all(
    [
      { title: "Mid-term examination schedule released", body: "Check the exam timetable for dates and rooms.", category: "Examination", source: "Admin Office" },
      { title: "Tomorrow's classes shifted online", body: "All lectures will be conducted via the college LMS.", category: "Academic", source: "Dean Academics" },
      { title: "Library timing extended during exams", body: "Open till 11 PM from next week.", category: "Events", source: "Library" },
      { title: "Fee payment deadline approaching", body: "Semester fees due by end of month.", category: "Fees", source: "Accounts" },
    ].map((n, i) =>
      prisma.notice.create({
        data: {
          userId: user.id,
          title: n.title,
          body: n.body,
          category: n.category,
          source: n.source,
          isRead: i === 3 ? false : i > 0 ? false : false,
          createdAt: new Date(today.getTime() - i * 3 * 60 * 60 * 1000),
        },
      })
    )
  );

  console.log("Seed complete. Login with demo@college.os / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
