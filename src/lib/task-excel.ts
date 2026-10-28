import type { Module, Priority, Status } from "@/lib/tasks";
import type { TaskDetailed } from "@/lib/task-store";
import type { Person, Project } from "@/lib/directory-store";

const HEADERS = ["Code", "Title", "Detail", "Module", "Status", "Priority", "Assignee"] as const;
const STATUSES: Status[] = ["backlog", "progress", "review", "done"];
const PRIORITIES: Priority[] = ["P1", "P2", "P3"];

export type ImportRow = {
  row: number;
  code: string;
  title: string;
  detail: string;
  module: Module;
  status: Status;
  priority: Priority;
  assignee: string;
  assigneeId: string | null;
};

export type ImportPreview = {
  fileName: string;
  rows: ImportRow[];
  errors: string[];
};

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tasks";
}

function download(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function createWorkbook(project: Project, modules: string[], people: Person[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Task Board";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tasks", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: HEADERS[0], key: "code", width: 16 },
    { header: HEADERS[1], key: "title", width: 34 },
    { header: HEADERS[2], key: "detail", width: 58 },
    { header: HEADERS[3], key: "module", width: 18 },
    { header: HEADERS[4], key: "status", width: 16 },
    { header: HEADERS[5], key: "priority", width: 12 },
    { header: HEADERS[6], key: "assignee", width: 24 },
  ];
  sheet.autoFilter = "A1:G1";
  sheet.getRow(1).height = 24;
  sheet.getRow(1).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2456D9" } };
  sheet.getRow(1).alignment = { vertical: "middle" };

  const lists = workbook.addWorksheet("Valid values");
  lists.state = "hidden";
  lists.addRow(["Modules", "Statuses", "Priorities", "Assignees"]);
  const max = Math.max(modules.length, STATUSES.length, PRIORITIES.length, people.length, 1);
  for (let index = 0; index < max; index += 1) {
    lists.addRow([modules[index] ?? "", STATUSES[index] ?? "", PRIORITIES[index] ?? "", people[index]?.name ?? ""]);
  }
  for (let row = 2; row <= 501; row += 1) {
    sheet.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`'Valid values'!$A$2:$A$${modules.length + 1}`] };
    sheet.getCell(`E${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`'Valid values'!$B$2:$B$${STATUSES.length + 1}`] };
    sheet.getCell(`F${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`'Valid values'!$C$2:$C$${PRIORITIES.length + 1}`] };
    sheet.getCell(`G${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [`'Valid values'!$D$2:$D$${Math.max(people.length + 1, 2)}`] };
  }

  const instructions = workbook.addWorksheet("Instructions", { properties: { tabColor: { argb: "FF2456D9" } } });
  instructions.columns = [{ width: 24 }, { width: 76 }];
  instructions.addRows([
    ["Task Board import", `${project.code} · ${project.name}`],
    ["Required", "Title, Module, Status and Priority"],
    ["Optional", "Code, Detail and Assignee"],
    ["Allowed status", STATUSES.join(", ")],
    ["Allowed priority", PRIORITIES.join(", ")],
    ["Important", "Keep the Tasks sheet name and header row unchanged. Maximum 500 task rows."],
  ]);
  instructions.getRow(1).font = { name: "Arial", bold: true, size: 14, color: { argb: "FF2456D9" } };
  instructions.eachRow((row) => { row.font = { ...row.font, name: "Arial" }; });
  return workbook;
}

export async function downloadTaskTemplate(project: Project, modules: string[], people: Person[]) {
  const workbook = await createWorkbook(project, modules, people);
  const sheet = workbook.getWorksheet("Tasks");
  sheet?.addRow({ code: "", title: "", detail: "", module: modules[0] ?? "Admin", status: "backlog", priority: "P2", assignee: "" });
  const buffer = await workbook.xlsx.writeBuffer();
  download(buffer as ArrayBuffer, `${safeName(project.code)}-task-import-template.xlsx`);
}

export async function exportTasksExcel(tasks: TaskDetailed[], project: Project, modules: string[], people: Person[]) {
  const workbook = await createWorkbook(project, modules, people);
  const sheet = workbook.getWorksheet("Tasks");
  for (const task of tasks) {
    sheet?.addRow({
      code: task.code,
      title: task.title,
      detail: task.detail,
      module: task.module,
      status: task.status,
      priority: task.priority,
      assignee: task.assigneeId ? task.assignee : "",
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  download(buffer as ArrayBuffer, `${safeName(project.code)}-tasks-${date}.xlsx`);
}

function cellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text).trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

export async function parseTaskWorkbook(file: File, modules: string[], people: Person[], existingCodes: string[]): Promise<ImportPreview> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { fileName: file.name, rows: [], errors: ["Choose an .xlsx file."] };
  if (file.size > 20 * 1024 * 1024) return { fileName: file.name, rows: [], errors: ["The file must be smaller than 20 MB."] };

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Tasks");
  if (!sheet) return { fileName: file.name, rows: [], errors: ["The workbook needs a sheet named Tasks."] };
  const headers = HEADERS.map((_, index) => cellText(sheet.getRow(1).getCell(index + 1).value));
  if (headers.some((header, index) => header !== HEADERS[index])) {
    return { fileName: file.name, rows: [], errors: ["The Tasks header row does not match the template."] };
  }

  const allowedModules = new Set(modules.map((value) => value.toLowerCase()));
  const peopleByName = new Map(people.map((person) => [person.name.toLowerCase(), person]));
  const usedCodes = new Set(existingCodes.map((code) => code.toLowerCase()));
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const lastRow = Math.min(sheet.actualRowCount, 501);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = HEADERS.map((_, index) => cellText(row.getCell(index + 1).value));
    if (values.every((value) => !value)) continue;
    const [code = "", title = "", detail = "", module = "", status = "", priority = "", assignee = ""] = values;
    const rowErrors: string[] = [];
    if (!title || title.length > 180) rowErrors.push("Title is required and must be 180 characters or fewer");
    if (detail.length > 4000) rowErrors.push("Detail must be 4,000 characters or fewer");
    if (!allowedModules.has(module.toLowerCase())) rowErrors.push("Module is not valid for this project");
    if (!STATUSES.includes(status as Status)) rowErrors.push("Status must be backlog, progress, review or done");
    if (!PRIORITIES.includes(priority as Priority)) rowErrors.push("Priority must be P1, P2 or P3");
    if (code && usedCodes.has(code.toLowerCase())) rowErrors.push("Code already exists or is repeated");
    const person = assignee ? peopleByName.get(assignee.toLowerCase()) : undefined;
    if (assignee && !person) rowErrors.push("Assignee is not a project member");
    if (rowErrors.length) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join("; ")}.`);
      continue;
    }
    if (code) usedCodes.add(code.toLowerCase());
    rows.push({ row: rowNumber, code, title, detail, module: module as Module, status: status as Status, priority: priority as Priority, assignee: person?.name ?? "Unassigned", assigneeId: person?.id ?? null });
  }
  if (sheet.actualRowCount > 501) errors.push("Only the first 500 task rows can be imported at once.");
  if (!rows.length && !errors.length) errors.push("No task rows were found.");
  return { fileName: file.name, rows, errors };
}