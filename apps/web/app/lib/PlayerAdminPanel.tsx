"use client";
import { useState } from "react";
import type { RconCommandResponse } from "@rustpilot/shared/browser";
import { api } from "./api";
import { parseRconPlayers, type RconPlayer } from "./playerList";
import type { StatusData } from "./useRustPilot";

interface PlayerAdminPanelProps {
  status: StatusData | null;
  refresh: () => Promise<void>;
}

export function PlayerAdminPanel({ status, refresh }: PlayerAdminPanelProps) {
  const [players, setPlayers] = useState<RconPlayer[]>([]);
  const [activePlayer, setActivePlayer] = useState<RconPlayer | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerReason, setPlayerReason] = useState("");
  const [playerMessage, setPlayerMessage] = useState("");
  const [unbanOpen, setUnbanOpen] = useState(false);
  const [unbanPlayer, setUnbanPlayer] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const rconReady = status?.process?.processState === "running";
  const maxPlayers = status?.settings?.maxPlayers;
  const filteredPlayers = players.filter((player) => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return true;
    return player.name.toLowerCase().includes(query) || player.id.toLowerCase().includes(query);
  });

  async function loadPlayers() {
    setPendingAction("players");
    setPlayerMessage("");
    try {
      const response = await api<RconCommandResponse>("/rcon/players", { method: "POST", body: "{}" });
      const nextPlayers = parseRconPlayers(response.message);
      setPlayers(nextPlayers);
      setActivePlayer((current) => current && nextPlayers.some((player) => player.id === current.id) ? current : null);
      setPlayerMessage(nextPlayers.length > 0 ? `Loaded ${nextPlayers.length} player${nextPlayers.length === 1 ? "" : "s"}.` : "No online players found.");
      await refresh();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  function openPlayer(player: RconPlayer) {
    setActivePlayer(player);
    setPlayerReason("");
    setPlayerMessage("");
  }

  function closePlayer() {
    setActivePlayer(null);
    setPlayerReason("");
  }

  async function playerAction(kind: "kick" | "ban") {
    if (!activePlayer) return;
    setPendingAction(kind);
    setPlayerMessage("");
    const playerName = activePlayer.name;
    try {
      await api(`/rcon/${kind}`, {
        method: "POST",
        body: JSON.stringify({ player: activePlayer.target, reason: playerReason })
      });
      closePlayer();
      await loadPlayers();
      setPlayerMessage(`${kind === "kick" ? "Kicked" : "Banned"} ${playerName}.`);
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function unbanSelectedPlayer() {
    const player = unbanPlayer.trim();
    if (!player) return;
    setPendingAction("unban");
    setPlayerMessage("");
    try {
      await api("/rcon/unban", {
        method: "POST",
        body: JSON.stringify({ player })
      });
      setUnbanOpen(false);
      setUnbanPlayer("");
      setPlayerMessage(`Unbanned ${player}.`);
      await refresh();
    } catch (error) {
      setPlayerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <section className="card player-count-card">
        <div>
          <span className="muted">Online players</span>
          <strong>{players.length}{typeof maxPlayers === "number" ? ` / ${maxPlayers}` : ""}</strong>
        </div>
      </section>
      <section className="card player-admin">
        <div className="player-admin-header">
          <div>
            <h2>Players</h2>
            <p className="muted">{players.length} loaded</p>
          </div>
          <div className="player-admin-header-actions">
            <button onClick={() => setUnbanOpen(true)} disabled={!rconReady || pendingAction !== null}>Unban</button>
            <button onClick={loadPlayers} disabled={!rconReady || pendingAction !== null}>
              {pendingAction === "players" ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
        <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Search by name or Steam ID" />
        <div className="player-list">
          {filteredPlayers.length === 0 ? (
            <p className="muted">No players loaded. Start the server and refresh the player list.</p>
          ) : filteredPlayers.map((player) => {
            return (
              <button className="player-row" key={player.id} onClick={() => openPlayer(player)}>
                <span>
                  <strong>{player.name}</strong>
                  <small>{player.id}{typeof player.ping === "number" ? ` · ${player.ping} ms` : ""}</small>
                </span>
              </button>
            );
          })}
        </div>
        {playerMessage && <p className="muted">{playerMessage}</p>}
      </section>
      {activePlayer && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal player-action-modal" role="dialog" aria-modal="true" aria-labelledby="player-action-title">
            <h2 id="player-action-title">{activePlayer.name}</h2>
            <p className="muted">
              {activePlayer.id}
              {typeof activePlayer.ping === "number" ? ` · ${activePlayer.ping} ms` : ""}
              {typeof activePlayer.connectedSeconds === "number" ? ` · ${formatConnected(activePlayer.connectedSeconds)}` : ""}
            </p>
            <label>
              <span>Reason, optional</span>
              <input
                autoFocus
                value={playerReason}
                onChange={(event) => setPlayerReason(event.target.value)}
                placeholder="Reason, optional"
                maxLength={160}
              />
            </label>
            <div className="actions">
              <button onClick={closePlayer} disabled={pendingAction !== null}>Cancel</button>
              <button onClick={() => playerAction("kick")} disabled={pendingAction !== null}>
                {pendingAction === "kick" ? "Kicking..." : "Kick"}
              </button>
              <button className="danger" onClick={() => playerAction("ban")} disabled={pendingAction !== null}>
                {pendingAction === "ban" ? "Banning..." : "Ban"}
              </button>
            </div>
          </section>
        </div>
      )}
      {unbanOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal player-action-modal" role="dialog" aria-modal="true" aria-labelledby="unban-title">
            <h2 id="unban-title">Unban player</h2>
            <p className="muted">Remove a ban by SteamID64 or exact player name.</p>
            <label>
              <span>SteamID64 or player name</span>
              <input
                autoFocus
                value={unbanPlayer}
                onChange={(event) => setUnbanPlayer(event.target.value)}
                placeholder="76561198000000000"
                maxLength={80}
              />
            </label>
            <div className="actions">
              <button onClick={() => setUnbanOpen(false)} disabled={pendingAction !== null}>Cancel</button>
              <button className="primary" onClick={unbanSelectedPlayer} disabled={!unbanPlayer.trim() || pendingAction !== null}>
                {pendingAction === "unban" ? "Unbanning..." : "Unban"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function formatConnected(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "connected <1m";
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `connected ${minutes}m`;
  return `connected ${hours}h ${minutes % 60}m`;
}
