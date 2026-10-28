import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — Task Board" },
      { name: "description", content: "Register for a Task Board account to see your project boards." },
      { property: "og:title", content: "Create account — Task Board" },
      { property: "og:description", content: "Register for Task Board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

const field =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setInfo("");
    if (!name.trim()) return setError("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) await navigate({ to: "/", replace: true });
    else setInfo("Account created. Check your email to confirm, then sign in.");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
          <UserPlus />
        </div>
        <h1 className="text-xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An admin will add you to your projects after you register.
        </p>
        <label className="mt-5 block text-xs font-medium">Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="name" />
        <label className="mt-3 block text-xs font-medium">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" />
        <label className="mt-3 block text-xs font-medium">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} autoComplete="new-password" />
        <label className="mt-3 block text-xs font-medium">Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className={field}
          autoComplete="new-password"
        />
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {info && <p className="mt-3 text-xs text-muted-foreground">{info}</p>}
        <Button className="mt-5 w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "Please wait…" : "Create account"}
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/auth" search={{ redirect: "/" }} className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
