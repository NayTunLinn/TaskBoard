import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  FileSpreadsheet,
  LayoutList,
  Rows3,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULES,
  PRIORITY_CLASS,
  STATUS_META,
  STATUS_ORDER,
  type Module,
  type Priority,
  type Status,
} from "@/lib/tasks";
import { exportTasksMarkdown, useTasks, updateTask as persistTask, type TaskDetailed } from "@/lib/task-store";
import { supabase } from "@/integrations/supabase/client";
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
          "Excel-style task grid with summary cards, filters, inline editing and bulk actions.",
      },
      { property: "og:title", content: "Task Board" },
      {
        property: "og:description",
        content: "Excel-style task grid with summary cards, filters, inline editing and bulk actions.",
      },
      { property: "og:type", content: "website" },
      { property: "twitter:card", content: "summary_large_image" },
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

const FILTER_KEY = "lsea-filters-v2";

type Filters = { statuses: Status[]; modules: Module[]; query: string; assignees: string[] };
const DEFAULT_FILTERS: Filters = { statuses: [], modules: [], query: "", assignees: [] };

type SortKey = "code" | "title" | "module" | "status" | "priority" | "assignee" | "updated";
type GroupKey = "none" | "status" | "module" | "assignee";
type Density = "compact" | "comfortable";

const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
const STATUS_RANK: Record<Status, number> = { progress: 0, review: 1, backlog: 2, done: 3 };

const COLUMNS: { key: SortKey | null; label: string; className: string; headerClass?: string }[] = [
  { key: null, label: "", className: "w-8 shrink-0" },
  { key: "code", label: "ID", className: "w-[4.75rem] shrink-0" },
  { key: "title", label: "Task name", className: "min-w-[14rem] flex-1" },
  { key: "module", label: "Module", className: "w-24 shrink-0" },
  { key: "status", label: "Status", className: "w-32 shrink-0" },
  { key: "priority", label: "Priority", className: "w-20 shrink-0" },
  { key: "assignee", label: "Assignee", className: "w-40 shrink-0" },
  { key: null, label: "", className: "w-8 shrink-0" },
];

function Index({ userId, email, isAdmin }: { userId: string; email: string; isAdmin: boolean }) {
  const { tasks: allTasks, hydrated, addTask: createTask } = useTasks();
  const { people: allPeople, projects, members, modules } = useDirectory();
  const { projectId, setActiveProject } = useViewer();

  const viewer = allPeople.find((p) => p.userId === userId) ?? null;

  const myProjects = visibleProjects(projects, members, viewer?.id ?? null, isAdmin);
  const activeProject = myProjects.find((p) => p.id === projectId) ?? myProjects[0] ?? null;

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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "code", dir: "asc" });
  const [group, setGroup] = useState<GroupKey>("none");
  const [density, setDensity] = useState<Density>("compact");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      if (f) {
        const parsed = JSON.parse(f) as Partial<Filters & { sort: typeof sort; group: GroupKey; density: Density }>;
        setFilters({ ...DEFAULT_FILTERS, ...(parsed as Partial<Filters>) });
        if (parsed.sort) setSort(parsed.sort);
        if (parsed.group) setGroup(parsed.group);
        if (parsed.density) setDensity(parsed.density);
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...filters, sort, group, density }));
    }
  }, [filters, sort, group, density, hydrated]);

  useEffect(() => {
    setSelected(new Set());
  }, [activeProject?.id, filters]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { done: 0, progress: 0, review: 0, backlog: 0 };
    for (const t of tasks) c[t.status] += 1;
    return c;
  }, [tasks]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
      if (filters.modules.length && !filters.modules.includes(t.module)) return false;
      if (filters.assignees.length && !filters.assignees.includes(t.assigneeId ?? "none")) return false;
      if (q && !(`${t.code} ${t.title} ${t.detail} ${t.module} ${t.assignee}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case "code":
          return a.code.localeCompare(b.code, undefined, { numeric: true }) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "module":
          return a.module.localeCompare(b.module) * dir;
        case "status":
          return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
        case "priority":
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
        case "assignee":
          return a.assignee.localeCompare(b.assignee) * dir;
        case "updated":
          return a.updated.localeCompare(b.updated) * dir;
      }
    });
  }, [tasks, filters, sort]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "all", label: "", items: visible }];
    const map = new Map<string, TaskDetailed[]>();
    for (const t of visible) {
      const k =
        group === "status" ? STATUS_META[t.status].label
        : group === "module" ? t.module
        : t.assignee || "Unassigned";
      const list = map.get(k);
      if (list) list.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, label: key, items }));
  }, [visible, group]);

  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const selectedCount = selected.size;

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((t) => t.id)));

  const bulkStatus = (status: Status) => {
    for (const id of selected) {
      void persistTask(id, { status }, `Status → ${STATUS_META[status].label}`);
    }
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    for (const id of selected) {
      await supabase.from("tasks").delete().eq("id", id);
    }
    setSelected(new Set());
    setConfirmDelete(false);
  };

  const setStatus = (id: string, status: Status) =>
    persistTask(id, { status }, `Status → ${STATUS_META[status].label}`);

  const assign = (taskId: string, personId: string) => {
    const p = people.find((x) => x.id === personId);
    void persistTask(
      taskId,
      { assigneeId: personId || null, assignee: p?.name ?? "Unassigned" },
      `Assigned to ${p?.name ?? "Unassigned"}`,
    );
  };

  const setPriority = (id: string, priority: Priority) =>
    persistTask(id, { priority }, `Priority → ${priority}`);

  const setModule = (id: string, module: Module) =>
    persistTask(id, { module }, `Module → ${module}`);

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

  const rowHeight = density === "compact" ? "h-9" : "h-11";
  const cellPad = density === "compact" ? "px-2.5" : "px-3";

  return (
    <div className="min-h-screen bg-canvas font-display text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-5">
          <div className="flex flex-col items-start">
            {mounted ? (
              <>
                <img src={logoLight.url} alt="Task Board" className="h-6 w-auto dark:hidden" />
                <img src={logoDark.url} alt="Task Board" className="hidden h-6 w-auto dark:block" />
              </>
            ) : (
              <img src={logoLight.url} alt="Task Board" className="h-6 w-auto" />
            )}
            <div className="font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">Project tracker</div>
          </div>

          <Select value={activeProject?.id ?? ""} onValueChange={(value) => setActiveProject(value || null)}>
            <SelectTrigger
              aria-label="Project"
              className="h-9 w-auto min-w-[13rem] max-w-[16rem] gap-2 rounded-lg border-border bg-muted px-2.5 text-[12px] font-medium text-ink shadow-none hover:bg-accent focus:ring-2 focus:ring-ring"
            >
              <span className="bg-brand/10 text-brand shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide">
                {activeProject?.code ?? "—"}
              </span>
              <SelectValue placeholder="Select project">{activeProject?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[16rem] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-lg" position="popper" sideOffset={6}>
              {myProjects.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-foreground">No projects</div>}
              {myProjects.map((p) => {
                const taskCount = allTasks.filter((t) => t.projectId === p.id).length;
                const isActive = p.id === activeProject?.id;
                return (
                  <SelectItem key={p.id} value={p.id} textValue={p.name} className="cursor-pointer rounded-lg px-2.5 py-2 text-[12px] focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-brand/10 data-[state=checked]:text-brand">
                    <div className="flex w-full items-center gap-2.5">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${isActive ? "bg-brand text-primary-foreground" : "bg-muted text-ink/60"}`}>
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

          <div className="ml-auto flex items-center gap-2">
            <div className="focus-within:ring-brand/40 hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted pr-2 pl-3 transition-shadow focus-within:ring-2 sm:flex">
              <Search className="size-3.5 text-ink/45" />
              <input
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                className="w-44 bg-transparent text-[12px] outline-none placeholder:text-ink/35"
                placeholder="Search tasks…"
              />
            </div>
            {isAdmin && (
              <Link to="/manage" className="hidden h-9 items-center rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-ink/60 hover:bg-accent sm:flex">
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
        {!activeProject && (
          <div className="py-16 text-center">
            <h2 className="text-base font-semibold">No projects assigned</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your admin will add you to your projects.</p>
          </div>
        )}

        {activeProject && (
          <>
            {/* Summary cards */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="Total tasks" value={tasks.length} tone="neutral" />
              <KpiCard label="In progress" value={counts.progress} tone="info" />
              <KpiCard label="In review" value={counts.review} tone="warn" />
              <KpiCard label="Completed" value={counts.done} tone="success" />
              <KpiCard label="Backlog" value={counts.backlog} tone="muted" />
            </div>

            {/* Toolbar */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button disabled={adding} onClick={() => setAdding(true)} className="h-8 px-3 text-[12px]">
                + New task
              </Button>

              <div className="focus-within:ring-brand/40 flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition-shadow focus-within:ring-2 lg:hidden">
                <Search className="size-3.5 text-ink/45" />
                <input
                  value={filters.query}
                  onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                  className="w-32 bg-transparent text-[12px] outline-none placeholder:text-ink/35"
                  placeholder="Search…"
                />
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Select value={group} onValueChange={(v) => setGroup(v as GroupKey)}>
                  <SelectTrigger aria-label="Group by" className="h-8 w-auto gap-1.5 rounded-lg border-border bg-card px-2.5 text-[11.5px] font-medium shadow-none focus:ring-2 focus:ring-ring">
                    <LayoutList className="size-3.5 text-ink/45" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={6} className="w-40 rounded-lg text-[12px]">
                    <SelectItem value="none">No grouping</SelectItem>
                    <SelectItem value="status">Group by status</SelectItem>
                    <SelectItem value="module">Group by module</SelectItem>
                    <SelectItem value="assignee">Group by assignee</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
                  aria-label="Toggle row density"
                  title={density === "compact" ? "Compact rows (36px)" : "Comfortable rows (44px)"}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11.5px] font-medium text-ink/60 hover:bg-accent"
                >
                  {density === "compact" ? <Rows3 className="size-3.5" /> : <LayoutList className="size-3.5" />}
                  {density === "compact" ? "Compact" : "Roomy"}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 px-2.5 text-[11.5px]">
                      <FileSpreadsheet className="size-3.5" /> Excel <ChevronDown className="size-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 rounded-lg p-1.5">
                    <DropdownMenuLabel className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">Project files</DropdownMenuLabel>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => void downloadTaskTemplate(activeProject, projectModules, people)}>
                      <Download /><span><span className="block text-xs font-medium">Download template</span><span className="block text-[10px] text-muted-foreground">Blank, validated Excel format</span></span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => void exportTasksExcel(tasks, activeProject, projectModules, people)}>
                      <FileDown /><span><span className="block text-xs font-medium">Export project tasks</span><span className="block text-[10px] text-muted-foreground">All {tasks.length} tasks in this project</span></span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => fileInputRef.current?.click()}>
                      <Upload /><span><span className="block text-xs font-medium">Import tasks</span><span className="block text-[10px] text-muted-foreground">Review before adding</span></span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer rounded-md py-2" onSelect={() => exportTasksMarkdown(tasks, activeProject)}>
                      <FileDown /> Export Markdown
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {importMessage && (
              <div className="mb-2 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand">{importMessage}</div>
            )}

            {/* New task draft row */}
            {adding && (
              <div className="mb-2 rounded-xl border border-border bg-card/85 p-3">
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
                  <select value={draft.module} onChange={(e) => setDraft((d) => ({ ...d, module: e.target.value as Module }))} className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium">
                    {projectModules.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Priority }))} className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium">
                    <option>P1</option><option>P2</option><option>P3</option>
                  </select>
                  <select value={draft.assigneeId} onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value }))} className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium">
                    <option value="">Unassigned</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={addTask} className="from-brand-light to-brand ml-auto h-7 rounded-md bg-gradient-to-b px-3 text-[11px] font-medium text-white">Save task</button>
                  <button onClick={() => setAdding(false)} className="h-7 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-ink/60">Cancel</button>
                </div>
              </div>
            )}

            {/* Grid */}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {/* header row */}
              <div className="grid grid-cols-[2rem_4.75rem_minmax(0,1fr)_6rem_8rem_5rem_10rem_2rem] items-center border-b border-border bg-muted/70 font-mono text-[9.5px] tracking-[0.12em] text-ink/50 uppercase">
                <label className={cellPad}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="accent-brand size-3.5"
                  />
                </label>
                {COLUMNS.slice(1).map((col) => (
                  <button
                    key={col.label || "actions"}
                    disabled={!col.key}
                    onClick={() => col.key && setSort((s) => ({ key: col.key!, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                    className={`${cellPad} flex items-center gap-1 text-left transition disabled:cursor-default ${col.key ? "hover:text-ink" : "cursor-default"}`}
                  >
                    {col.label}
                    {sort.key === col.key && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ))}
              </div>

              {/* rows */}
              <div className="divide-y divide-border">
                {groups.map((g) => (
                  <div key={g.key}>
                    {group !== "none" && (
                      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5">
                        <ChevronRight className="size-3.5 text-ink/40" />
                        <span className="text-[11.5px] font-semibold tracking-tight">{g.label}</span>
                        <span className="font-mono text-[10px] text-ink/40">{g.items.length}</span>
                      </div>
                    )}
                    {g.items.map((t, idx) => {
                      const isSelected = selected.has(t.id);
                      const isDone = t.status === "done";
                      return (
                        <div
                          key={t.id}
                          className={`${rowHeight} group grid grid-cols-[2rem_4.75rem_minmax(0,1fr)_6rem_8rem_5rem_10rem_2rem] items-center text-[12.5px] transition-colors ${idx % 2 === 1 ? "bg-muted/30" : "bg-card"} ${isSelected ? "!bg-brand/8 ring-brand/25 ring-1 ring-inset" : "hover:bg-accent/60"}`}
                        >
                          <label className={`${cellPad} flex items-center`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(t.id)}
                              aria-label={`Select ${t.code}`}
                              className="accent-brand size-3.5"
                            />
                          </label>
                          <Link to="/task/$taskId" params={{ taskId: t.id }} className={`${cellPad} text-brand/80 truncate font-mono text-[10.5px] hover:underline`}>
                            {t.code}
                          </Link>
                          <div className={`${cellPad} min-w-0`}>
                            <Link
                              to="/task/$taskId"
                              params={{ taskId: t.id }}
                              className={`block truncate hover:decoration-brand/40 hover:underline hover:underline-offset-2 ${isDone ? "text-ink/45 line-through" : "font-medium"}`}
                            >
                              {t.title}
                            </Link>
                          </div>
                          <div className={`${cellPad} min-w-0`}>
                            <select
                              value={t.module}
                              onChange={(e) => setModule(t.id, e.target.value as Module)}
                              className="w-full cursor-pointer truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-medium text-ink/75 hover:border-border hover:bg-background focus:border-border focus:bg-background focus:outline-none"
                            >
                              {projectModules.map((m) => <option key={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className={`${cellPad} min-w-0`}>
                            <span className={`chip ${STATUS_META[t.status].chip}`}>
                              <span className={`size-1.5 rounded-full ${STATUS_META[t.status].dot}`} />
                              {STATUS_META[t.status].label}
                            </span>
                          </div>
                          <div className={`${cellPad} min-w-0`}>
                            <span className={`pri ${PRIORITY_CLASS[t.priority]}`}>{t.priority}</span>
                          </div>
                          <div className={`${cellPad} min-w-0`}>
                            <select
                              value={t.assigneeId ?? ""}
                              onChange={(e) => assign(t.id, e.target.value)}
                              className="w-full cursor-pointer truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-ink/80 hover:border-border hover:bg-background focus:border-border focus:bg-background focus:outline-none"
                            >
                              <option value="">Unassigned</option>
                              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div className={`${cellPad} flex items-center justify-end gap-0.5`}>
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              <select
                                value={t.status}
                                onChange={(e) => setStatus(t.id, e.target.value as Status)}
                                aria-label={`Status of ${t.code}`}
                                className="h-6 w-[6.5rem] cursor-pointer rounded border-border bg-background px-1 text-[10.5px] font-medium"
                              >
                                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {visible.length === 0 && (
                  <div className="rounded-b-xl bg-card py-12 text-center font-mono text-[11px] text-ink/45">
                    No tasks match the current filters.
                  </div>
                )}
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedCount > 0 && (
              <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur">
                <span className="px-1 text-[12px] font-medium">{selectedCount} selected</span>
                <span className="h-4 w-px bg-border" />
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => bulkStatus("progress")}>Start</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => bulkStatus("review")}>Review</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => bulkStatus("done")}><Check className="size-3.5" /> Done</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                  <X className="size-3.5" /> Delete
                </Button>
                <span className="h-4 w-px bg-border" />
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}

            {/* Footer meta */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-ink/40">
              <span>
                Showing {visible.length} of {tasks.length} · {activeProject.name}
              </span>
              <span>
                Filters · {filters.statuses.length ? filters.statuses.map((s) => STATUS_META[s].label).join(", ") : "All statuses"} ·{" "}
                {filters.modules.length ? filters.modules.join(", ") : "All modules"} ·{" "}
                {filters.assignees.length ? `${filters.assignees.length} assignee${filters.assignees.length === 1 ? "" : "s"}` : "All assignees"}
              </span>
            </div>

            {/* Sidebar filters (kept below grid on smaller widths, floating right on wide screens) */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <FilterSection title="Status">
                {STATUS_ORDER.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-muted">
                    <input type="checkbox" checked={filters.statuses.includes(s)} onChange={() => setFilters((f) => ({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] }))} className="accent-brand size-3.5" />
                    <span className="flex-1">{STATUS_META[s].label}</span>
                    <span className="font-mono text-[10px] text-ink/40">{counts[s]}</span>
                  </label>
                ))}
              </FilterSection>
              <FilterSection title="Module">
                <div className="flex flex-wrap gap-1.5">
                  {projectModules.map((m) => {
                    const on = filters.modules.includes(m as Module);
                    return (
                      <button key={m} onClick={() => setFilters((f) => ({ ...f, modules: f.modules.includes(m as Module) ? f.modules.filter((x) => x !== m) : [...f.modules, m as Module] }))} className={`chip cursor-pointer ${on ? "border-brand/25 bg-brand/10 text-brand" : "border-border bg-muted text-ink/60 hover:bg-accent"}`}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
              <FilterSection title="Assignee">
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1 text-[12px]">
                  {people.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                      <input type="checkbox" checked={filters.assignees.includes(p.id)} onChange={() => setFilters((f) => ({ ...f, assignees: f.assignees.includes(p.id) ? f.assignees.filter((x) => x !== p.id) : [...f.assignees, p.id] }))} className="accent-brand size-3.5" />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-ink/40">{tasks.filter((t) => t.assigneeId === p.id).length}</span>
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                    <input type="checkbox" checked={filters.assignees.includes("none")} onChange={() => setFilters((f) => ({ ...f, assignees: f.assignees.includes("none") ? f.assignees.filter((x) => x !== "none") : [...f.assignees, "none"] }))} className="accent-brand size-3.5" />
                    <span className="flex-1 text-ink/60">Unassigned</span>
                    <span className="font-mono text-[10px] text-ink/40">{tasks.filter((t) => !t.assigneeId).length}</span>
                  </label>
                </div>
              </FilterSection>
            </div>
            <div className="mt-3">
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-ink/60 hover:bg-accent">
                Reset filters
              </button>
            </div>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void parseTaskWorkbook(file, projectModules, people, allTasks.map((task) => task.code)).then(setImportPreview);
        event.target.value = "";
      }} />

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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm rounded-lg p-5">
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} task{selectedCount === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>This permanently removes the selected tasks and their history. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void bulkDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "info" | "warn" | "success" | "muted" }) {
  const toneClass = {
    neutral: "text-ink",
    info: "text-sky-600 dark:text-sky-400",
    warn: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
    muted: "text-ink/50",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
      <div className={`text-[19px] leading-none font-semibold tracking-tight ${toneClass}`}>{value}</div>
      <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.14em] text-ink/45 uppercase">{label}</div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/70 p-3">
      <div className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">{title}</div>
      {children}
    </section>
  );
}
