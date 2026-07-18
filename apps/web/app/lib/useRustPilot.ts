"use client";
import { useEffect, useMemo, useState } from "react";
import type { ConsoleEvent } from "@rustpilot/shared/browser";
import { api } from "./api";
import { buildWebSocketUrl, type WebSocketConnectionState } from "./ws";

export interface StatusData {
  process: any;
  setup: any;
  paths: any;
  settings: any;
  redactedLaunchArgs: string[];
  websocket?: { path: string; url: string };
  installRunning: boolean;
}

export function useRustPilot() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [wsState, setWsState] = useState<WebSocketConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading((current) => current && !status);
    try {
      const next = await api<StatusData>("/status");
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const configuredUrl = status?.websocket?.url;
    if (!configuredUrl && !status && !error) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      setWsState(attempts === 0 ? "connecting" : "temporarily_disconnected");
      const url = configuredUrl ?? buildWebSocketUrl(location);
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempts = 0;
        setWsState("connected");
      };
      socket.onclose = () => {
        if (closed) return;
        attempts += 1;
        setWsState(attempts > 4 ? "backend_unreachable" : "temporarily_disconnected");
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts, 5));
        reconnectTimer = setTimeout(connect, delay);
      };
      socket.onerror = () => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`RustPilot WebSocket handshake failed for ${url}`);
        }
      };
      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.type === "history") setEvents(payload.events);
        if (payload.type === "console") setEvents((current) => [...current.slice(-1499), payload.event]);
        if (payload.type === "snapshot") setStatus((current) => ({ ...(current ?? {}), ...payload.status }));
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [status?.websocket?.url, error]);

  return useMemo(
    () => ({ status, events, setEvents, connected: wsState === "connected", wsState, error, loading, refresh }),
    [status, events, wsState, error, loading]
  );
}
