"use client";
import { useSearchParams } from "next/navigation";

export default function AuthLoginPage() {
  const search = useSearchParams();
  const error = search.get("error");
  return (
    <section className="panel setup-panel auth-panel">
      <span className="setup-eyebrow">Login required</span>
      <h1>Login with Steam</h1>
      {error && <p className="error">{error}</p>}
      <p className="muted">Use an allowed Steam account to access this RustPilot panel.</p>
      <div className="actions">
        <a className="button primary" href="/api/auth/steam/login?returnTo=/dashboard">Login with Steam</a>
      </div>
    </section>
  );
}
