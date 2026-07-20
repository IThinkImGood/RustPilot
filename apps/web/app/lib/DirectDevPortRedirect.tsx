"use client";
import { useEffect, useState } from "react";

export function DirectDevPortRedirect() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const publicHost = process.env.NEXT_PUBLIC_RUSTPILOT_HOST ?? "127.0.0.1";
    const publicPort = process.env.NEXT_PUBLIC_RUSTPILOT_PORT ?? "40815";
    const devPort = process.env.NEXT_PUBLIC_RUSTPILOT_WEB_DEV_PORT ?? "3001";
    if (location.hostname === publicHost && location.port === devPort) {
      const target = `http://${publicHost}:${publicPort}${location.pathname}${location.search}${location.hash}`;
      setMessage(`RustPilot runs through ${target}. Redirecting.`);
      location.replace(target);
    }
  }, []);

  return message ? <div className="dev-redirect">{message}</div> : null;
}
