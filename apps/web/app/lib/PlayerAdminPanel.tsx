"use client";
import { useState } from "react";
import type { RconCommandResponse } from "@rustpilot/shared/browser";
import { api } from "./api";
import type { StatusData } from "./useRustPilot";

interface PlayerAdminPanelProps {
  status: StatusData | null;
  refresh: () => Promise<void>;
}

interface RconPlayer {
  id: string;
  name: string;
  target: string;
}

export function PlayerAdminPanel({ status, refresh }: PlayerAdminPanelProps) {
  const [players, setPlayers] = useState<RconPlayer[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerReason, setPlayerReason] = useState("");
  const [playerMessage, setPlayerMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const rconReady = status?.process?.processState === "running";
  const filteredPlayers = players.filter((player) => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return true;
    return player.name.toLowerCase().includes(query) || player.id.toLowerCase().includes(query);
  });
  const allVisibleSelected = filteredPlayers.length > 0 && filteredPlayers.every((player) => selectedPlayers.includes(player.id));

  async function loadPlayers() {
    setPendingAction("players");
    setPlayerMessage("");
    try {
      const response = await api<RconCommandResponse>("/rcon/players", { method: "POST", body: "{}" });
      const nextPlayers = parseRconPlayers(response.message);
      setPlayers(nextPlayers);
      setSelectedPlayers((current) => current.filter((id) => nextPlayers.some((player) => player.id === id)));
      setPlayerMessage(nextPlayers.length > 0 ? `Loaded ${nextPlayers.length} player${nextPlayers.length === 1 ? "" : "s"}.` : "No online players found.");
      await refresh();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  function togglePlayer(id: string) {
    setSelectedPlayers((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllPlayers() {
    const visibleIds = filteredPlayers.map((player) => player.id);
    const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selectedPlayers.includes(id));
    setSelectedPlayers((current) => allVisible ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
  }

  async function playerAction(kind: "kick" | "ban") {
    const targets = players.filter((player) => selectedPlayers.includes(player.id));
    if (targets.length === 0) return;
    setPendingAction(kind);
    setPlayerMessage("");
    try {
      for (const player of targets) {
        await api(`/rcon/${kind}`, {
          method: "POST",
          body: JSON.stringify({ player: player.target, reason: playerReason })
        });
      }
      setPlayerMessage(`${kind === "kick" ? "Kicked" : "Banned"} ${targets.length} player${targets.length === 1 ? "" : "s"}.`);
      setSelectedPlayers([]);
      setPlayerReason("");
      await loadPlayers();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="card player-admin">
      <div className="player-admin-header">
        <div>
          <h2>Players</h2>
          <p className="muted">{selectedPlayers.length} selected</p>
        </div>
        <button onClick={loadPlayers} disabled={!rconReady || pendingAction !== null}>
          {pendingAction === "players" ? "Loading..." : "Refresh"}
        </button>
      </div>
      <button className="player-select-all" onClick={toggleAllPlayers} disabled={filteredPlayers.length === 0}>
        {allVisibleSelected ? "Clear visible selection" : "Select all visible players"}
      </button>
      <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Search by name or Steam ID" />
      <div className="player-list">
        {filteredPlayers.length === 0 ? (
          <p className="muted">No players loaded. Start the server and refresh the player list.</p>
        ) : filteredPlayers.map((player) => {
          const selected = selectedPlayers.includes(player.id);
          return (
            <button className={`player-row ${selected ? "selected" : ""}`} key={player.id} onClick={() => togglePlayer(player.id)} aria-pressed={selected}>
              <span>
                <strong>{player.name}</strong>
                <small>{player.id}</small>
              </span>
            </button>
          );
        })}
      </div>
      <input value={playerReason} onChange={(event) => setPlayerReason(event.target.value)} placeholder="Reason, optional" maxLength={160} />
      <div className="player-admin-actions">
        <button onClick={() => playerAction("kick")} disabled={selectedPlayers.length === 0 || pendingAction !== null}>
          {pendingAction === "kick" ? "Kicking..." : "Kick selected"}
        </button>
        <button className="danger" onClick={() => playerAction("ban")} disabled={selectedPlayers.length === 0 || pendingAction !== null}>
          {pendingAction === "ban" ? "Banning..." : "Ban selected"}
        </button>
      </div>
      {playerMessage && <p className="muted">{playerMessage}</p>}
    </section>
  );
}

function parseRconPlayers(message: string): RconPlayer[] {
  const trimmed = message.trim();
  if (!trimmed) return [];
  const jsonPlayers = parseJsonPlayers(trimmed);
  if (jsonPlayers.length > 0) return jsonPlayers;
  return parseTextPlayers(trimmed);
}

function parseJsonPlayers(message: string): RconPlayer[] {
  try {
    const parsed = JSON.parse(message);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const steamId = stringValue(record.SteamID) ?? stringValue(record.steamid) ?? stringValue(record.id) ?? String(index + 1);
      const name = stringValue(record.DisplayName) ?? stringValue(record.displayName) ?? stringValue(record.name) ?? steamId;
      return { id: steamId, name, target: steamId };
    });
  } catch {
    return [];
  }
}

function parseTextPlayers(message: string): RconPlayer[] {
  return message
    .split(/\r?\n/)
    .map((line, index) => {
      const text = line.trim();
      if (!text || /^playerlist/i.test(text)) return null;
      const steamId = text.match(/\b\d{15,20}\b/)?.[0];
      const withoutPrefix = text.replace(/^\d+[).:-]?\s*/, "").trim();
      const name = withoutPrefix.replace(/\b\d{15,20}\b/g, "").replace(/[(),-]+$/g, "").trim() || steamId || text;
      const id = steamId ?? `${index}-${name}`;
      return { id, name, target: steamId ?? name };
    })
    .filter((player): player is RconPlayer => player !== null);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}
