function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((item) => item.trim());
  const token = cookies.find((item) => item.startsWith("rustpilot_csrf="));
  return token ? decodeURIComponent(token.slice("rustpilot_csrf=".length)) : null;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const token = method === "GET" || method === "HEAD" ? null : csrfToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-RustPilot-CSRF": token } : {}),
      ...(init?.headers ?? {})
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("RustPilot API is not reachable through this origin. Open http://127.0.0.1:40815.");
  }
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "API error");
  return json.data as T;
}
