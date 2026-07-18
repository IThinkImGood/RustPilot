export async function waitForFrontendReady(
  url: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60000;
  const intervalMs = options.intervalMs ?? 1000;
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "x-rustpilot-internal-probe": "1" },
        redirect: "manual"
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok || contentType.includes("text/html") || contentType.includes("text/x-component")) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Development frontend niet klaar op ${url}: ${lastError || "timeout"}`);
}
