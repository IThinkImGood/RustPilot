export type AppLayoutMode = "loading" | "error" | "setup-only" | "app";

export function getAppLayoutMode(input: {
  loading: boolean;
  hasError: boolean;
  setupCompleted?: boolean;
}): AppLayoutMode {
  if (input.loading) return "loading";
  if (input.hasError) return "error";
  return input.setupCompleted ? "app" : "setup-only";
}

export function shouldRedirectForSetup(pathname: string, setupCompleted: boolean): string | null {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (!setupCompleted && ["/", "/dashboard", "/console", "/settings"].includes(normalized)) {
    return "/setup";
  }
  if (setupCompleted && (normalized === "/" || normalized === "/setup")) {
    return "/dashboard";
  }
  return null;
}
