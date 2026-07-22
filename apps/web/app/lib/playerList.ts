export interface RconPlayer {
  id: string;
  name: string;
  target: string;
  ping?: number | null;
  connectedSeconds?: number | null;
}

export function parseRconPlayers(message: string): RconPlayer[] {
  const trimmed = message.trim();
  if (!trimmed) return [];
  const jsonPlayers = parseJsonPlayers(trimmed);
  if (jsonPlayers.length > 0) return dedupePlayers(jsonPlayers);
  return dedupePlayers(parseTextPlayers(trimmed));
}

function parseJsonPlayers(message: string): RconPlayer[] {
  try {
    const parsed = JSON.parse(message);
    const list = Array.isArray(parsed) ? parsed : arrayFromKnownEnvelope(parsed);
    if (!list) return [];
    return list
      .map((item, index) => normalizeJsonPlayer(item, index))
      .filter((player): player is RconPlayer => player !== null);
  } catch {
    return [];
  }
}

function arrayFromKnownEnvelope(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["players", "Players", "data", "Data"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return null;
}

function normalizeJsonPlayer(value: unknown, index: number): RconPlayer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const steamId =
    stringValue(record.SteamID) ??
    stringValue(record.steamId) ??
    stringValue(record.steamid) ??
    stringValue(record.userid) ??
    stringValue(record.UserID) ??
    stringValue(record.id);
  const name =
    stringValue(record.DisplayName) ??
    stringValue(record.displayName) ??
    stringValue(record.Name) ??
    stringValue(record.name) ??
    steamId ??
    `Player ${index + 1}`;
  const id = steamId ?? `${index}-${name}`;
  return {
    id,
    name,
    target: steamId ?? name,
    ping: numberValue(record.Ping) ?? numberValue(record.ping),
    connectedSeconds: numberValue(record.ConnectedSeconds) ?? numberValue(record.connectedSeconds)
  };
}

function parseTextPlayers(message: string): RconPlayer[] {
  return message
    .split(/\r?\n/)
    .map((line, index) => parseTextPlayerLine(line, index))
    .filter((player): player is RconPlayer => player !== null);
}

function parseTextPlayerLine(line: string, index: number): RconPlayer | null {
  const text = line.trim();
  if (!text || /^playerlist\b/i.test(text) || /^steamid\b/i.test(text) || /^players?:\s*$/i.test(text)) return null;
  const steamId = text.match(/\b\d{15,20}\b/)?.[0] ?? null;
  const quotedName = text.match(/"([^"]+)"/)?.[1]?.trim() ?? null;
  const ping = numberFromMatch(text.match(/\bping[:=]?\s*(\d+)\b/i) ?? text.match(/\b(\d+)\s*ms\b/i));
  const name = quotedName ?? inferTextName(text, steamId) ?? steamId ?? text;
  return {
    id: steamId ?? `${index}-${name}`,
    name,
    target: steamId ?? name,
    ping
  };
}

function inferTextName(text: string, steamId: string | null): string | null {
  let value = text
    .replace(/^\s*\d+[).:-]?\s*/, "")
    .replace(/\b\d{15,20}\b/g, "")
    .replace(/\bping[:=]?\s*\d+\b/gi, "")
    .replace(/\b\d+\s*ms\b/gi, "")
    .replace(/\b(address|ip|connected|seconds|secs|health)[:=]\S+/gi, "")
    .replace(/[|,()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value || value === steamId) return null;
  value = value.replace(/^name[:=]\s*/i, "").trim();
  return value || null;
}

function dedupePlayers(players: RconPlayer[]): RconPlayer[] {
  const seen = new Set<string>();
  const result: RconPlayer[] = [];
  for (const player of players) {
    const key = player.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(player);
  }
  return result;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function numberFromMatch(match: RegExpMatchArray | null): number | null {
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
