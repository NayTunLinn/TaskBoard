export function canManageSetup(isAdmin: boolean) {
  return isAdmin;
}

export function visibleProjects<T extends { id: string }>(projects: T[], memberships: { projectId: string; personId: string }[], personId: string | null, isAdmin: boolean): T[] {
  if (isAdmin) return projects;
  if (!personId) return [];
  const ids = new Set(memberships.filter((member) => member.personId === personId).map((member) => member.projectId));
  return projects.filter((project) => ids.has(project.id));
}