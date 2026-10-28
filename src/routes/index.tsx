import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileDown, FileSpreadsheet, Upload } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULES,
  MODULE_CHIP,
  PRIORITY_CLASS,
  STATUS_META,
  STATUS_ORDER,
  type Module,
  type Priority,
  type Status,
} from "@/lib/tasks";
import { exportTasksMarkdown, useTasks, type TaskDetailed } from "@/lib/task-store";
import { useDirectory } from "@/lib/directory-store";
import { useViewer } from "@/lib/viewer";
import { useAuth, signOut } from "@/lib/auth";
import { visibleProjects } from "@/lib/access-rules";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadTaskTemplate, exportTasksExcel, parseTaskWorkbook, type ImportPreview } from "@/lib/task-excel";
import logoLight from "@/assets/task-board-logo-light.png.asset.json";
import logoDark from "@/assets/task-board-logo-dark.png.asset.json";




export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Task Board" },
      {
        name: "description",
        content:
          "Clean, compact project task board with search, filters and live status updates.",
      },
      { property: "og:title", content: "Task Board" },
      {
        property: "og:description",
        content: "Clean, compact project task board with search, filters and live status updates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BoardGate,
});

function BoardGate() {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || auth.loading) return <div className="grid min-h-screen place-items-center bg-canvas text-sm text-muted-foreground">Loading…</div>;
  if (!auth.user) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink">
        <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold">Task Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to see your project boards.</p>
          <Link to="/auth" search={{ redirect: "/" }} className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">Sign in</Link>
          <Link to="/register" className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium">Create account</Link>
        </section>
      </main>
    );
  }
  return <Index userId={auth.user.id} email={auth.user.email ?? ""} isAdmin={auth.isAdmin} />;
}


const FILTER_KEY = "lsea-filters-v1";

type Filters = { statuses: Status[]; modules: Module[]; query: string; assignees: string[] };
const DEFAULT_FILTERS: Filters = { statuses: [], modules: [], query: "", assignees: [] };

function Index({ userId, email, isAdmin }: { userId: string; email: string; isAdmin: boolean }) {
  const { tasks: allTasks, hydrated, addTask: createTask, updateTask } = useTasks();
  const { people: allPeople, projects, members, modules, roles } = useDirectory();
  const { projectId, setActiveProject } = useViewer();

  const viewer = allPeople.find((p) => p.userId === userId) ?? null;
  const canUseExcel = true;

  // Access is enforced by the database: admins get every project, others only projects they are mapped to.
  const myProjects = visibleProjects(projects, members, viewer?.id ?? null, isAdmin);

  const activeProject =
    myProjects.find((p) => p.id === projectId) ?? myProjects[0] ?? null;

  const tasks = useMemo(
    () => (activeProject ? allTasks.filter((t) => t.projectId === activeProject.id) : []),
    [allTasks, activeProject],
  );

  const people = useMemo(() => {
    if (!activeProject) return allPeople;
    const ids = new Set(members.filter((m) => m.projectId === activeProject.id).map((m) => m.personId));
    const list = allPeople.filter((p) => ids.has(p.id));
    return list.length ? list : allPeople;
  }, [allPeople, members, activeProject]);
  const projectModules = useMemo(() => {
    const names = activeProject ? modules.filter((module) => !module.projectId || module.projectId === activeProject.id).map((module) => module.name) : [];
    return names.length ? names : [...MODULES];
  }, [modules, activeProject]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<string | null>("t1");
  const [adding, setAdding] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({
    title: "",
    detail: "",
    module: "Admin" as Module,
    priority: "P2" as Priority,
    assigneeId: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);


  useEffect(() => {
    try {
      const f = sessionStorage.getItem(FILTER_KEY);
      if (f) setFilters({ ...DEFAULT_FILTERS, ...(JSON.parse(f) as Partial<Filters>) });
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  }, [filters, hydrated]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { done: 0, progress: 0, review: 0, backlog: 0 };
    for (const t of tasks) c[t.status] += 1;
    return c;
  }, [tasks]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
      if (filters.modules.length && !filters.modules.includes(t.module)) return false;
      if (filters.assignees.length && !filters.assignees.includes(t.assigneeId ?? "none")) return false;
      if (q && !(`${t.code} ${t.title} ${t.detail} ${t.module} ${t.assignee}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, filters]);

  const toggleStatus = (s: Status) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));

  const toggleModule = (m: Module) =>
    setFilters((f) => ({
      ...f,
      modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m],
    }));

  const toggleAssignee = (id: string) =>
    setFilters((f) => ({
      ...f,
      assignees: f.assignees.includes(id) ? f.assignees.filter((x) => x !== id) : [...f.assignees, id],
    }));

  const setStatus = (id: string, status: Status) =>
    updateTask(id, { status }, `Status → ${STATUS_META[status].label}`);

  const assign = (taskId: string, personId: string) => {
    const p = people.find((x) => x.id === personId);
    void updateTask(
      taskId,
      { assigneeId: personId || null, assignee: p?.name ?? "Unassigned" },
      `Assigned to ${p?.name ?? "Unassigned"}`,
    );
  };

  const addTask = () => {
    if (!draft.title.trim()) return;
    const n = allTasks.length + 101;
    const person = people.find((p) => p.id === draft.assigneeId);
    const next: TaskDetailed = {
      id: `t${Date.now()}`,
      code: `${activeProject?.code ?? "LSEA"}-${n}`,
      projectId: activeProject?.id ?? null,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      module: draft.module,
      status: "backlog",
      priority: draft.priority,
      updated: "now",
      assignee: person?.name ?? "Unassigned",
      assigneeId: person?.id ?? null,
      checklist: [],
      activity: [{ id: `a${Date.now()}`, at: new Date().toISOString(), text: "Task created" }],
    };
    void createTask(next);
    setDraft({ title: "", detail: "", module: "Admin", priority: "P2", assigneeId: "" });
    setAdding(false);
  };

  const confirmImport = async () => {
    if (!activeProject || !importPreview?.rows.length || importPreview.errors.length) return;
    setImporting(true);
    const baseNumber = allTasks.length + 101;
    await Promise.all(importPreview.rows.map((row, index) => createTask({
      id: `t${Date.now()}-${index}`,
      code: row.code || `${activeProject.code}-${baseNumber + index}`,
      projectId: activeProject.id,
      title: row.title,
      detail: row.detail,
      module: row.module,
      status: row.status,
      priority: row.priority,
      updated: "now",
      assignee: row.assignee,
      assigneeId: row.assigneeId,
      notes: "",
      checklist: [],
      activity: [],
    })));
    const count = importPreview.rows.length;
    setImporting(false);
    setImportPreview(null);
    setImportMessage(`${count} task${count === 1 ? "" : "s"} imported.`);
  };





  return (
    <div className="min-h-screen bg-canvas font-display text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-5">
          <div className="flex flex-col items-start">
            {mounted ? (
              <>
                <img
                  src={logoLight.url}
                  alt="Task Board"
                  className="h-6 w-auto dark:hidden"
                />
                <img
                  src={logoDark.url}
                  alt="Task Board"
                  className="hidden h-6 w-auto dark:block"
                />
              </>
            ) : (
              <img
                src={logoLight.url}
                alt="Task Board"
                className="h-6 w-auto"
              />
            )}
            <div className="font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">
              Project tracker
            </div>
          </div>

          <Select
            value={activeProject?.id ?? ""}
            onValueChange={(value) => setActiveProject(value || null)}
          >
            <SelectTrigger
              aria-label="Project"
              className="h-9 w-auto min-w-[13rem] max-w-[16rem] gap-2 rounded-lg border-border bg-muted px-2.5 text-[12px] font-medium text-ink shadow-none hover:bg-accent focus:ring-2 focus:ring-ring"
            >
              <span className="bg-brand/10 text-brand shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide">
                {activeProject?.code ?? "—"}
              </span>
              <SelectValue placeholder="Select project">{activeProject?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent
              className="min-w-[16rem] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
              position="popper"
              sideOffset={6}
            >
              {myProjects.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">No projects</div>
              )}
              {myProjects.map((p) => {
                const taskCount = allTasks.filter((t) => t.projectId === p.id).length;
                const isActive = p.id === activeProject?.id;
                return (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    textValue={p.name}
                    className="cursor-pointer rounded-lg px-2.5 py-2 text-[12px] focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-brand/10 data-[state=checked]:text-brand"
                  >
                    <div className="flex w-full items-center gap-2.5">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${
                          isActive ? "bg-brand text-primary-foreground" : "bg-muted text-ink/60"
                        }`}
                      >
                        {p.code}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-ink/40">{taskCount}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>

          </Select>


          <div className="ml-2 hidden items-center gap-1.5 md:flex">
            {STATUS_ORDER.map((s) => (
              <span key={s} className={`chip ${STATUS_META[s].chip}`}>
                <span className={`size-1.5 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label} {String(counts[s]).padStart(2, "0")}
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="focus-within:ring-brand/40 hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted pr-2 pl-3 transition-shadow focus-within:ring-2 sm:flex">
              <span className="font-mono text-[12px] text-ink/45">⌕</span>
              <input
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                className="w-40 bg-transparent text-[12px] outline-none placeholder:text-ink/35"
                placeholder="Search tasks…"
              />
            </div>
            {isAdmin && (
              <Link
                to="/manage"
                className="hidden h-9 items-center rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-ink/60 hover:bg-accent sm:flex"
              >
                People &amp; setup
              </Link>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Account" className="from-brand to-primary grid size-9 place-items-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-primary-foreground shadow-sm ring-1 ring-border">
                  {(viewer?.name ?? email).slice(0, 2).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[12px]">
                  <div className="truncate">{viewer?.name ?? email}</div>
                  <div className="truncate text-[11px] font-normal text-muted-foreground">{email}</div>
                  <span className="mt-1 inline-block rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] text-brand">{isAdmin ? "Admin" : "User"}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="bg-sheen mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1440px] px-5 py-5">
        <div className="flex items-start gap-5">
          <aside className="sticky top-[4.5rem] hidden w-52 shrink-0 space-y-4 rounded-xl border border-border bg-card/70 p-3.5 backdrop-blur-sm lg:block">
            <div>
              <div className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">Status</div>
              <div className="space-y-1 text-[12px]">
                {STATUS_ORDER.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(s)}
                      onChange={() => toggleStatus(s)}
                      className="accent-brand size-3.5"
                    />
                    <span className="flex-1">{STATUS_META[s].label}</span>
                    <span className="font-mono text-[10px] text-ink/40">{counts[s]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">Module</div>
              <div className="flex flex-wrap gap-1.5">
                {MODULES.map((m) => {
                  const on = filters.modules.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleModule(m)}
                      className={`chip cursor-pointer ${on ? "bg-brand/10 text-brand border-brand/25" : "border-border bg-muted text-ink/60 hover:bg-accent"}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">Assignee</div>
              <div className="focus-within:ring-brand/40 mb-2 flex h-8 items-center gap-2 rounded-lg border border-border bg-muted px-2 transition-shadow focus-within:ring-2">
                <span className="font-mono text-[12px] text-ink/45">⌕</span>
                <input
                  value={assigneeQuery}
                  onChange={(e) => setAssigneeQuery(e.target.value)}
                  className="w-full bg-transparent text-[11px] outline-none placeholder:text-ink/35"
                  placeholder="Search people…"
                />
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1 text-[12px]">
                {people
                  .filter((p) => p.name.toLowerCase().includes(assigneeQuery.trim().toLowerCase()))
                  .map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={filters.assignees.includes(p.id)}
                        onChange={() => toggleAssignee(p.id)}
                        className="accent-brand size-3.5"
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-ink/40">
                        {tasks.filter((t) => t.assigneeId === p.id).length}
                      </span>
                    </label>
                  ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={filters.assignees.includes("none")}
                    onChange={() => toggleAssignee("none")}
                    className="accent-brand size-3.5"
                  />
                  <span className="flex-1 text-ink/60">Unassigned</span>
                  <span className="font-mono text-[10px] text-ink/40">
                    {tasks.filter((t) => !t.assigneeId).length}
                  </span>
                </label>
              </div>
              {isAdmin && <Link
                to="/manage"
                className="text-brand mt-2 inline-block text-[11px] font-medium hover:underline"
              >
                Manage people →
              </Link>}
            </div>


            <div className="border-t border-border pt-3">
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="w-full rounded-lg border border-border bg-background py-1.5 text-[11px] font-medium text-ink/60 hover:bg-accent"
              >
                Reset filters
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h1 className="max-w-[28ch] text-[19px] leading-none font-semibold tracking-tight">
                  {activeProject ? `${activeProject.name} task board` : "Task board"}
                </h1>
                <p className="mt-1.5 font-mono text-[11px] text-ink/45">
                  {activeProject?.code ?? "—"} · {tasks.length} tasks · filters saved to session
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canUseExcel && activeProject && <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" className="h-9 px-3 text-xs"><FileSpreadsheet /> Excel <ChevronDown className="size-3.5 opacity-60" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 rounded-lg p-1.5">
                    <DropdownMenuLabel className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">Project files</DropdownMenuLabel>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => void downloadTaskTemplate(activeProject, projectModules, people)}><Download /><span><span className="block text-xs font-medium">Download template</span><span className="block text-[10px] text-muted-foreground">Blank, validated Excel format</span></span></DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => void exportTasksExcel(tasks, activeProject, projectModules, people)}><FileDown /><span><span className="block text-xs font-medium">Export project tasks</span><span className="block text-[10px] text-muted-foreground">All {tasks.length} tasks in this project</span></span></DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => fileInputRef.current?.click()}><Upload /><span><span className="block text-xs font-medium">Import tasks</span><span className="block text-[10px] text-muted-foreground">Review before adding</span></span></DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => exportTasksMarkdown(tasks, activeProject)}><FileDown /> Export Markdown</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>}
                <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void parseTaskWorkbook(file, projectModules, people, allTasks.map((task) => task.code)).then(setImportPreview);
                  event.target.value = "";
                }} />
                <Button
                  disabled={!activeProject}
                  onClick={() => setAdding((v) => !v)}
                  className="h-9 px-3 text-xs"
                >
                  <span className="text-sm leading-none">+</span> Add task
                </Button>
              </div>
            </div>

            {!activeProject && <div className="py-12 text-center"><h2 className="text-base font-semibold">No projects assigned</h2><p className="mt-2 text-sm text-muted-foreground">Your admin will add you to your projects.</p></div>}
            {importMessage && <div className="mb-3 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand">{importMessage}</div>}

            {adding && (
              <div className="mb-3 rounded-xl border border-border bg-card/85 p-3">
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Task title"
                  className="focus:ring-brand/30 w-full rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[13px] font-medium outline-none focus:ring-2"
                />
                <textarea
                  value={draft.detail}
                  onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))}
                  placeholder="Detail / acceptance notes"
                  rows={2}
                  className="focus:ring-brand/30 mt-2 w-full resize-none rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[12px] outline-none focus:ring-2"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={draft.module}
                    onChange={(e) => setDraft((d) => ({ ...d, module: e.target.value as Module }))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                  >
                    {MODULES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={draft.priority}
                    onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Priority }))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                  >
                    <option>P1</option>
                    <option>P2</option>
                    <option>P3</option>
                  </select>
                  <select
                    value={draft.assigneeId}
                    onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                  >
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={addTask}
                    className="from-brand-light to-brand ml-auto h-7 rounded-md bg-gradient-to-b px-3 text-[11px] font-medium text-white"
                  >
                    Save task
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    className="h-7 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-ink/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_7.5rem_6.5rem_5rem_5rem] gap-3 px-3 pb-1.5 font-mono text-[9px] tracking-[0.14em] text-ink/35 uppercase md:grid">
              <span />
              <span>Task</span>
              <span>Module</span>
              <span>Status</span>
              <span>Priority</span>
              <span className="text-right">Updated</span>
            </div>

            <div className="space-y-1.5">
              {visible.map((t) => {
                const isOpen = open === t.id;
                return (
                  <div
                    key={t.id}
                    className="hover:border-brand/30 rounded-xl border border-border bg-card/80 transition-shadow hover:shadow-md"
                  >
                    <div
                      onClick={() => setOpen(isOpen ? null : t.id)}
                      className="grid cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 px-3 py-2.5 md:grid-cols-[1.5rem_minmax(0,1fr)_7.5rem_6.5rem_5rem_5rem]"
                    >
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(t.id, e.target.checked ? "done" : "progress")}
                        className="accent-brand size-3.5"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-brand/70 font-mono text-[10px]">{t.code}</span>
                          <Link
                            to="/task/$taskId"
                            params={{ taskId: t.id }}
                            onClick={(e) => e.stopPropagation()}
                            className={`hover:decoration-brand/40 truncate text-[13px] font-medium hover:underline hover:underline-offset-2 ${t.status === "done" ? "text-ink/45 line-through" : ""}`}
                          >
                            {t.title}
                          </Link>
                        </div>
                      </div>

                      <span className={`chip hidden md:inline-flex ${MODULE_CHIP[t.module]}`}>{t.module}</span>
                      <span className={`chip ${STATUS_META[t.status].chip}`}>
                        <span className={`size-1.5 rounded-full ${STATUS_META[t.status].dot}`} />
                        {STATUS_META[t.status].label}
                      </span>
                      <span className={`pri hidden md:inline ${PRIORITY_CLASS[t.priority]}`}>{t.priority}</span>
                      <span className="hidden text-right font-mono text-[10px] text-ink/40 md:inline">{t.updated}</span>
                    </div>

                    {isOpen && (
                      <div className="px-3 pt-0.5 pb-3 md:px-4">
                        <div className="rounded-lg border border-border bg-muted/80 p-3">
                          <p className="max-w-[70ch] text-[12px] leading-relaxed text-ink/70">{t.detail}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-ink/50">Status:</span>
                            <select
                              value={t.status}
                              onChange={(e) => setStatus(t.id, e.target.value as Status)}
                              className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_META[s].label}
                                </option>
                              ))}
                            </select>
                            <span className="ml-auto text-[11px] text-ink/50">Assignee:</span>
                            <select
                              value={t.assigneeId ?? ""}
                              onChange={(e) => assign(t.id, e.target.value)}
                              className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                            >
                              <option value="">Unassigned</option>
                              {people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>

                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {visible.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center font-mono text-[11px] text-ink/45">
                  No tasks match the current filters.
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between font-mono text-[10px] text-ink/40">
              <span>
                Showing {visible.length} of {tasks.length} · {activeProject?.name ?? "All projects"}
              </span>
              <span>
                Filters ·{" "}
                {filters.statuses.length ? filters.statuses.map((s) => STATUS_META[s].label).join(", ") : "All statuses"}{" "}
                · {filters.modules.length ? filters.modules.join(", ") : "All modules"}
              </span>
            </div>
          </main>
        </div>
      </div>
      <Dialog open={importPreview !== null} onOpenChange={(open) => { if (!open && !importing) setImportPreview(null); }}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-lg p-5">
          <DialogHeader><DialogTitle>Review Excel import</DialogTitle><DialogDescription>{importPreview?.fileName} · {activeProject?.name}</DialogDescription></DialogHeader>
          {importPreview && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2"><div className="rounded-md border border-border bg-muted p-3"><div className="text-xl font-semibold">{importPreview.rows.length}</div><div className="text-xs text-muted-foreground">Valid tasks</div></div><div className="rounded-md border border-border bg-muted p-3"><div className="text-xl font-semibold text-destructive">{importPreview.errors.length}</div><div className="text-xs text-muted-foreground">Rows needing attention</div></div></div>
            {importPreview.errors.length > 0 && <div className="max-h-44 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3"><ul className="space-y-1 text-xs text-destructive">{importPreview.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
            {importPreview.rows.length > 0 && <div className="overflow-hidden rounded-md border border-border"><div className="grid grid-cols-[3rem_1fr_7rem_5rem] gap-2 bg-muted px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase"><span>Row</span><span>Title</span><span>Module</span><span>Priority</span></div><div className="max-h-52 overflow-y-auto">{importPreview.rows.map((row) => <div key={row.row} className="grid grid-cols-[3rem_1fr_7rem_5rem] gap-2 border-t border-border px-3 py-2 text-xs"><span className="font-mono text-muted-foreground">{row.row}</span><span className="truncate">{row.title}</span><span className="truncate">{row.module}</span><span>{row.priority}</span></div>)}</div></div>}
            {importPreview.errors.length > 0 && <p className="text-xs text-muted-foreground">Correct the listed rows in Excel, then choose the file again. Nothing has been imported.</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>Cancel</Button><Button onClick={() => void confirmImport()} disabled={importing || !importPreview?.rows.length || Boolean(importPreview?.errors.length)}>{importing ? "Importing…" : `Import ${importPreview?.rows.length ?? 0} tasks`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
