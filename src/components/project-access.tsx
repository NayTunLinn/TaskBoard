import { useEffect, useState } from "react";
import { Check, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDirectory, addProjectMember, removeProjectMember, setUserRole } from "@/lib/directory-store";
import { supabase } from "@/integrations/supabase/client";

export function ProjectAccess({ currentUserId }: { currentUserId: string }) {
  const dir = useDirectory();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [admins, setAdmins] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const accounts = dir.people.filter((person) => person.userId);
  const selected = accounts.find((person) => person.id === selectedId) ?? accounts[0];
  useEffect(() => {
    void supabase.from("user_roles").select("user_id").eq("role", "admin").then(({ data }) => setAdmins((data ?? []).map((row) => row.user_id)));
  }, []);
  async function change(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); setMessage("Access saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save access."); }
    finally { setBusy(false); }
  }
  return <section>
    <h1 className="text-base font-semibold">Project access</h1>
    <div className="mt-4 grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <input aria-label="Search accounts" placeholder="Search accounts…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
        <div className="mt-2 max-h-96 space-y-1 overflow-y-auto">
          {accounts.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase())).map((person) => <Button key={person.id} variant={selected?.id === person.id ? "secondary" : "ghost"} disabled={busy} onClick={() => { setSelectedId(person.id); setMessage(""); }} className="h-auto w-full justify-start py-3 text-left">
            <UserRound className="shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate text-xs font-medium">{person.name}</span><span className="block truncate text-[11px] text-muted-foreground">{person.email}</span></span>
          </Button>)}
          {!accounts.length && <p className="py-6 text-xs text-muted-foreground">No registered accounts yet.</p>}
        </div>
      </div>
      {selected && <div className="min-w-0">
        <h2 className="text-sm font-semibold">{selected.name}</h2>
        <p className="mt-1 break-all text-xs text-muted-foreground">{selected.email}</p>
        <label className="mt-4 flex items-center gap-2 text-xs font-medium"><Shield className="size-4 text-brand" /> Account role
          <select aria-label="Account role" value={selected.userId && admins.includes(selected.userId) ? "admin" : "user"} disabled={busy || selected.userId === currentUserId} className="ml-auto h-8 rounded-md border border-input bg-background px-2" onChange={(event) => {
            const userId = selected.userId;
            if (!userId) return;
            const admin = event.target.value === "admin";
            void change(async () => { await setUserRole(userId, admin); setAdmins((previous) => admin ? [...previous, userId] : previous.filter((id) => id !== userId)); });
          }}><option value="user">User</option><option value="admin">Admin</option></select>
        </label>
        <h3 className="mt-5 border-t border-border pt-4 text-xs font-semibold">Assigned projects</h3>
        <div className="mt-2 divide-y divide-border">{dir.projects.map((project) => {
          const membership = dir.members.find((member) => member.projectId === project.id && member.personId === selected.id);
          return <label key={project.id} className="flex cursor-pointer items-center gap-3 py-3 text-xs">
            <input aria-label={`Access to ${project.name}`} type="checkbox" checked={Boolean(membership)} disabled={busy} className="size-4 accent-brand" onChange={() => void change(() => membership ? removeProjectMember(membership.id) : addProjectMember(project.id, selected.id))} />
            <span className="rounded bg-brand/10 px-1.5 py-1 font-mono text-[10px] text-brand">{project.code}</span><span className="min-w-0 flex-1 truncate">{project.name}</span>{membership && <Check className="size-4 text-brand" />}
          </label>;
        })}</div>
        <div role="status" className="mt-3 min-h-5 text-xs text-muted-foreground">{busy ? "Saving…" : message}</div>
      </div>}
    </div>
  </section>;
}