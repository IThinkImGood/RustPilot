export type WebSocketConnectionState =
  | "connecting"
  | "connected"
  | "temporarily_disconnected"
  | "backend_unreachable";

export function buildWebSocketUrl(locationLike: Pick<Location, "protocol" | "host">, path = "/ws"): string {
  const protocol = locationLike.protocol === "https:" ? "wss" : "ws";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${locationLike.host}${normalizedPath}`;
}
