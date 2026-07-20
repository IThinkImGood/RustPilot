export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("RustPilot API is not reachable through this origin. Open http://127.0.0.1:40815.");
  }
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "API error");
  return json.data as T;
}
