"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRustPilot } from "./lib/useRustPilot";
import { getSetupRedirectTarget } from "./lib/routes";

export default function RootPage() {
  const router = useRouter();
  const { status, error, loading, refresh } = useRustPilot();
  useEffect(() => {
    if (!loading && !error && status) {
      const target = getSetupRedirectTarget("/", status.setup?.setupCompleted === true);
      if (target) router.replace(target);
    }
  }, [loading, error, status, router]);
  if (loading) return <section className="panel">Loading RustPilot status...</section>;
  if (error) {
    return (
      <section className="panel">
        <h1>Status Error</h1>
        <p className="muted">{error}</p>
        <button onClick={refresh}>Try again</button>
      </section>
    );
  }
  return (
    <section className="panel">Redirecting...</section>
  );
}
