const protectedPaths = new Set(["/dashboard", "/console", "/settings"]);

export function getSetupRedirectTarget(pathname: string, setupCompleted: boolean): string | null {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (normalized === "/") return setupCompleted ? "/dashboard" : "/setup";
  if (!setupCompleted && protectedPaths.has(normalized)) return "/setup";
  return null;
}
