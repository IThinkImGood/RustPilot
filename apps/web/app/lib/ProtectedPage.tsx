"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StatusData } from "./useRustPilot";
import { getSetupRedirectTarget } from "./routes";

export function ProtectedPage({
  status,
  error,
  loading,
  onRetry,
  children
}: {
  status: StatusData | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const setupCompleted = status?.setup?.setupCompleted === true;

  useEffect(() => {
    if (!loading && !error && status && !setupCompleted) {
      const target = getSetupRedirectTarget(location.pathname, setupCompleted);
      if (target) router.replace(target);
    }
  }, [loading, error, status, setupCompleted, router]);

  if (loading) {
    return <section className="panel">Loading RustPilot status...</section>;
  }

  if (error) {
    return (
      <section className="panel">
        <h1>Status Error</h1>
        <p className="muted">{error}</p>
        <button onClick={onRetry}>Try again</button>
      </section>
    );
  }

  if (!status || !setupCompleted) {
    return <section className="panel">Opening setup...</section>;
  }

  return <>{children}</>;
}
