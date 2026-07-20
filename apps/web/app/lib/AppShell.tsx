"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DirectDevPortRedirect } from "./DirectDevPortRedirect";
import { getAppLayoutMode, shouldRedirectForSetup } from "./layoutMode";
import { useRustPilot } from "./useRustPilot";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, loading, error, refresh } = useRustPilot();
  const setupCompleted = status?.setup?.setupCompleted === true;
  const mode = getAppLayoutMode({ loading, hasError: Boolean(error), setupCompleted });
  const redirectTarget = shouldRedirectForSetup(pathname, setupCompleted);

  useEffect(() => {
    if (!loading && !error && redirectTarget && redirectTarget !== pathname) {
      router.replace(redirectTarget);
    }
  }, [loading, error, redirectTarget, pathname, router]);

  if (mode === "loading") {
    return (
      <>
        <DirectDevPortRedirect />
        <main className="setup-shell">
          <section className="panel">Loading RustPilot status...</section>
        </main>
      </>
    );
  }

  if (mode === "error") {
    return (
      <>
        <DirectDevPortRedirect />
        <main className="setup-shell">
          <section className="panel">
            <h1>Status Error</h1>
            <p className="muted">{error}</p>
            <button onClick={refresh}>Try again</button>
          </section>
        </main>
      </>
    );
  }

  if (mode === "setup-only") {
    return (
      <>
        <DirectDevPortRedirect />
        <main className="setup-shell">
          <div className="setup-brand">RustPilot</div>
          {redirectTarget && redirectTarget !== pathname ? <section className="panel">Opening setup...</section> : children}
        </main>
      </>
    );
  }

  return (
    <>
      <DirectDevPortRedirect />
      <div className="shell">
        <nav className="nav">
          <div className="brand">RustPilot</div>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/console">Console</Link>
          <Link href="/settings">Settings</Link>
          {!setupCompleted && <Link href="/setup">Setup</Link>}
        </nav>
        <main className="main">{redirectTarget && redirectTarget !== pathname ? <section className="panel">Redirecting...</section> : children}</main>
      </div>
    </>
  );
}
