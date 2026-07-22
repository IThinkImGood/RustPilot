const protectedPaths = new Set(["/dashboard", "/console", "/logs", "/settings", "/cfg-editor", "/backups", "/backups/manual", "/backups/automatic", "/wipes"]);

export function getSetupRedirectTarget(pathname: string, setupCompleted: boolean): string | null {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (normalized === "/") return setupCompleted ? "/dashboard" : "/setup";
  if (!setupCompleted && protectedPaths.has(normalized)) return "/setup";
  return null;
}
