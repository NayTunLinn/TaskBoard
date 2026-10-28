import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search["redirect"] === "string" && search["redirect"].startsWith("/") && !search["redirect"].startsWith("//")
        ? search["redirect"]
        : "/",
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Task Board" },
      { name: "description", content: "Sign in to see your Task Board projects." },
      { property: "og:title", content: "Sign in — Task Board" },
      { property: "og:description", content: "Secure access to Task Board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const field =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setError("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else await navigate({ to: redirect, replace: true });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
          <LockKeyhole />
        </div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Access your team's project boards.</p>
        <label className="mt-5 block text-xs font-medium">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" />
        <label className="mt-3 block text-xs font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void signIn();
          }}
          className={field}
          autoComplete="current-password"
        />
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <Button className="mt-5 w-full" disabled={busy} onClick={() => void signIn()}>
          {busy ? "Please wait…" : "Sign in"}
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
