import crypto from "node:crypto";
import type express from "express";
import type { AuthPermission, AuthRole, AuthStatus, AuthUser } from "@rustpilot/shared";
import type { Storage } from "./storage.js";

const COOKIE_NAME = "rustpilot_session";
const CSRF_COOKIE_NAME = "rustpilot_csrf";
const CSRF_HEADER_NAME = "x-rustpilot-csrf";
const SESSION_DAYS = 14;
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const OWNER_PERMISSIONS: AuthPermission[] = [
  "manage.users",
  "settings.write",
  "server.control",
  "console.write",
  "announcement",
  "players.kick",
  "players.ban",
  "cfg.write",
  "backups.write",
  "wipes.write",
  "danger.write"
];
const ADMIN_PERMISSIONS: AuthPermission[] = [
  "settings.write",
  "server.control",
  "console.write",
  "announcement",
  "players.kick",
  "players.ban",
  "cfg.write",
  "backups.write",
  "wipes.write"
];

export interface AuthContext {
  user: AuthUser | null;
  tokenHash: string | null;
}

type CookieRequest = {
  headers: {
    cookie?: string;
  };
};

export interface AuthManager {
  status(req: CookieRequest, res?: express.Response): AuthStatus;
  getContext(req: CookieRequest): AuthContext;
  permissionsForRole(role: AuthRole): AuthPermission[];
  createSteamLoginUrl(returnTo?: string): string;
  handleSteamCallback(req: express.Request, res: express.Response): Promise<string>;
  logout(req: express.Request, res: express.Response): void;
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void;
  requireRole(roles: AuthRole[]): (req: express.Request, res: express.Response, next: express.NextFunction) => void;
  requirePermission(permission: AuthPermission): (req: express.Request, res: express.Response, next: express.NextFunction) => void;
  requireCsrf(req: express.Request, res: express.Response, next: express.NextFunction): void;
  csrfToken(req: CookieRequest, res?: express.Response): string;
}

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, details } };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [rawKey, ...rest] = item.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function secureCookieSuffix(panelUrl: string): string {
  return panelUrl.startsWith("https://") ? "; Secure" : "";
}

function cookieValue(name: string, value: string, options: string): string {
  return `${name}=${encodeURIComponent(value)}; ${options}`;
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value.length > 200 ? "/dashboard" : value;
}

function publicUrl(panelUrl: string, path: string): string {
  return `${panelUrl}${path}`;
}

export function createAuthManager(storage: Storage, panelUrl: string): AuthManager {
  function permissionsForRole(role: AuthRole): AuthPermission[] {
    if (role === "owner") return OWNER_PERMISSIONS;
    if (role === "admin") return ADMIN_PERMISSIONS;
    return [];
  }

  function withPermissions(user: AuthUser): AuthUser {
    return { ...user, permissions: permissionsForRole(user.role) };
  }

  function getContext(req: CookieRequest): AuthContext {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    if (!token) return { user: null, tokenHash: null };
    const tokenHash = hashToken(token);
    const session = storage.getAuthSession(tokenHash);
    if (!session) return { user: null, tokenHash: null };
    return { user: withPermissions(session.user), tokenHash };
  }

  function setSessionCookie(res: express.Response, steamId64: string): void {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    storage.saveAuthSession(hashToken(token), steamId64, expiresAt);
    res.setHeader(
      "Set-Cookie",
      cookieValue(COOKIE_NAME, token, `Max-Age=${SESSION_DAYS * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax${secureCookieSuffix(panelUrl)}`)
    );
  }

  function setCsrfCookie(res: express.Response, token: string): void {
    res.append(
      "Set-Cookie",
      cookieValue(CSRF_COOKIE_NAME, token, `Max-Age=${SESSION_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secureCookieSuffix(panelUrl)}`)
    );
  }

  function csrfToken(req: CookieRequest, res?: express.Response): string {
    const existing = parseCookie(req.headers.cookie, CSRF_COOKIE_NAME);
    if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
    const token = randomToken();
    if (res) setCsrfCookie(res, token);
    return token;
  }

  async function verifySteamCallback(query: express.Request["query"]): Promise<string> {
    const claimedId = typeof query["openid.claimed_id"] === "string" ? query["openid.claimed_id"] : "";
    const match = STEAM_ID_PATTERN.exec(claimedId);
    if (!match) throw new Error("Steam did not return a valid SteamID64.");

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && key.startsWith("openid.")) params.set(key, value);
    }
    params.set("openid.mode", "check_authentication");

    const response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    if (!response.ok) throw new Error("Steam OpenID verification failed.");
    const body = await response.text();
    if (!/(^|\n)is_valid:true(\n|$)/.test(body)) throw new Error("Steam OpenID response was not valid.");
    return match[1];
  }

  return {
    status(req, res) {
      storage.pruneExpiredAuthSessions();
      const context = getContext(req);
      return {
        required: true,
        hasOwner: storage.hasAuthOwner(),
        user: context.user,
        csrfToken: context.user ? csrfToken(req, res) : null
      };
    },
    getContext,
    permissionsForRole,
    csrfToken,
    createSteamLoginUrl(returnTo = "/dashboard") {
      const callbackUrl = publicUrl(panelUrl, `/api/auth/steam/callback?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
      const params = new URLSearchParams({
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callbackUrl,
        "openid.realm": panelUrl,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
      });
      return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
    },
    async handleSteamCallback(req, res) {
      const steamId64 = await verifySteamCallback(req.query);
      let user = storage.getAuthUser(steamId64);
      if (!storage.hasAuthOwner()) {
        user = storage.saveAuthUser({
          steamId64,
          displayName: `Steam ${steamId64}`,
          role: "owner",
          enabled: true
        });
      }
      if (!user || !user.enabled) throw new Error("This Steam account is not allowed to access RustPilot.");
      storage.markAuthLogin(steamId64);
      setSessionCookie(res, steamId64);
      setCsrfCookie(res, randomToken());
      return safeReturnTo(req.query.returnTo);
    },
    logout(req, res) {
      const context = getContext(req);
      if (context.tokenHash) storage.deleteAuthSession(context.tokenHash);
      res.setHeader("Set-Cookie", [
        cookieValue(COOKIE_NAME, "", `Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureCookieSuffix(panelUrl)}`),
        cookieValue(CSRF_COOKIE_NAME, "", `Max-Age=0; Path=/; SameSite=Lax${secureCookieSuffix(panelUrl)}`)
      ]);
    },
    requireAuth(req, res, next) {
      if (!storage.hasAuthOwner()) {
        res.status(401).json(fail("AUTH_OWNER_REQUIRED", "Login with Steam to claim this RustPilot installation."));
        return;
      }
      const context = getContext(req);
      if (!context.user) {
        res.status(401).json(fail("AUTH_REQUIRED", "Login with Steam to use RustPilot."));
        return;
      }
      next();
    },
    requireRole(roles) {
      return (req, res, next) => {
        const context = getContext(req);
        if (!context.user) {
          res.status(401).json(fail("AUTH_REQUIRED", "Login with Steam to use RustPilot."));
          return;
        }
        if (!roles.includes(context.user.role)) {
          res.status(403).json(fail("AUTH_FORBIDDEN", "Your RustPilot role cannot perform this action."));
          return;
        }
        next();
      };
    },
    requirePermission(permission) {
      return (req, res, next) => {
        const context = getContext(req);
        if (!context.user) {
          res.status(401).json(fail("AUTH_REQUIRED", "Login with Steam to use RustPilot."));
          return;
        }
        if (!context.user.permissions.includes(permission)) {
          res.status(403).json(fail("AUTH_FORBIDDEN", "Your RustPilot role cannot perform this action."));
          return;
        }
        next();
      };
    },
    requireCsrf(req, res, next) {
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        next();
        return;
      }
      const cookieToken = parseCookie(req.headers.cookie, CSRF_COOKIE_NAME);
      const headerToken = req.headers[CSRF_HEADER_NAME];
      if (!cookieToken || typeof headerToken !== "string" || headerToken !== cookieToken) {
        res.status(403).json(fail("CSRF_FAILED", "Security token is missing or invalid."));
        return;
      }
      next();
    }
  };
}
