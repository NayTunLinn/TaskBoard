import { describe, expect, test } from "bun:test";
import { canManageSetup, visibleProjects } from "./access-rules";

describe("account project authorization", () => {
  const projects = [{ id: "LSEA" }, { id: "other" }];
  const memberships = [{ projectId: "LSEA", personId: "member" }];
  test("only admins can manage setup", () => {
    expect(canManageSetup(false)).toBe(false);
    expect(canManageSetup(true)).toBe(true);
  });
  test("members see only their mapped projects", () => {
    expect(visibleProjects(projects, memberships, "member", false)).toEqual([{ id: "LSEA" }]);
  });
  test("unmapped accounts see no projects", () => {
    expect(visibleProjects(projects, memberships, null, false)).toEqual([]);
    expect(visibleProjects(projects, memberships, "unmapped", false)).toEqual([]);
  });
  test("admins see every project", () => {
    expect(visibleProjects(projects, memberships, null, true)).toEqual(projects);
  });
});