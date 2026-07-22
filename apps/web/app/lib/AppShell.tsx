"use client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCode, faGear, faGaugeHigh, faTerminal, faWrench } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DirectDevPortRedirect } from "./DirectDevPortRedirect";
import { getAppLayoutMode, shouldRedirectForSetup } from "./layoutMode";
import { PlayerAdminPanel } from "./PlayerAdminPanel";
import { ServerControlsPanel } from "./ServerControlsPanel";
import { useRustPilot } from "./useRustPilot";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, loading, error, refresh } = useRustPilot();
  const setupCompleted = status?.setup?.setupCompleted === true;
  const mode = getAppLayoutMode({ loading, hasError: Boolean(error), setupCompleted });
  const redirectTarget = shouldRedirectForSetup(pathname, setupCompleted);
  const activePath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

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
        <header className="app-header">
          <Link className="app-header-brand" href="/dashboard">RustPilot</Link>
          <div className="top-nav">
            <Link href="/settings" className={activePath === "/settings" ? "active" : undefined}>
              <FontAwesomeIcon className="nav-link-icon" icon={faGear} fixedWidth />
              <span>Settings</span>
            </Link>
            <Link href="/cfg-editor" className={activePath === "/cfg-editor" ? "active" : undefined}>
              <FontAwesomeIcon className="nav-link-icon" icon={faFileCode} fixedWidth />
              <span>CFG Editor</span>
            </Link>
          </div>
        </header>
        <nav className="nav">
          <div className="nav-links">
            <Link href="/dashboard" className={activePath === "/dashboard" ? "active" : undefined}>
              <FontAwesomeIcon className="nav-link-icon" icon={faGaugeHigh} fixedWidth />
              <span>Dashboard</span>
            </Link>
            <Link href="/console" className={activePath === "/console" ? "active" : undefined}>
              <FontAwesomeIcon className="nav-link-icon" icon={faTerminal} fixedWidth />
              <span>Console</span>
            </Link>
            {!setupCompleted && (
              <Link href="/setup" className={activePath === "/setup" ? "active" : undefined}>
                <FontAwesomeIcon className="nav-link-icon" icon={faWrench} fixedWidth />
                <span>Setup</span>
              </Link>
            )}
          </div>
          <ServerControlsPanel status={status} refresh={refresh} />
        </nav>
        <main className="main">{redirectTarget && redirectTarget !== pathname ? <section className="panel">Redirecting...</section> : children}</main>
        <aside className="app-player-sidebar">
          <PlayerAdminPanel status={status} refresh={refresh} />
        </aside>
      </div>
    </>
  );
}
