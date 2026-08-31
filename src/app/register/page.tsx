"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/components/client-utils";
import { AuthShell } from "@/components/AuthShell";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    course: "",
    semester: "3",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          course: form.course || null,
          semester: Number(form.semester),
        }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            placeholder="Ayush Pawar"
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            placeholder="you@college.edu"
          />
        </div>
        <div>
          <label className="label">Course</label>
          <input
            className="input"
            value={form.course}
            onChange={(e) => update("course", e.target.value)}
            placeholder="B.Tech CSE"
          />
        </div>
        <div>
          <label className="label">Semester</label>
          <select
            className="input"
            value={form.semester}
            onChange={(e) => update("semester", e.target.value)}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                Semester {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-slate-500 dark:text-slate-400 mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-600 font-medium">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
