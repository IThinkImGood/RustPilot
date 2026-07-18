export type SetupValidationKind = "ok" | "error" | "empty";

export interface SetupValidationResult {
  kind: SetupValidationKind;
  message: string;
}

export type SetupValidationMap = Record<string, SetupValidationResult | undefined>;

const identityPattern = /^[a-zA-Z0-9_-]+$/;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberText(value: unknown): string {
  return String(value ?? "").trim();
}

function integerValue(value: unknown): number | null {
  const raw = numberText(value);
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

function validateIntegerRange(value: unknown, min: number, max: number, message: string): SetupValidationResult {
  const numeric = integerValue(value);
  if (numeric === null || numeric < min || numeric > max) return { kind: "error", message };
  return { kind: "ok", message: "Geldig" };
}

function portLabel(field: string): string {
  if (field === "gamePort") return "Game port";
  if (field === "queryPort") return "Query port";
  if (field === "rconPort") return "RCON port";
  if (field === "webPort") return "Web port";
  return "port";
}

function validateUrl(value: unknown): SetupValidationResult {
  const raw = text(value);
  if (!raw) return { kind: "empty", message: "" };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid protocol");
    return { kind: "ok", message: "Geldig" };
  } catch {
    return { kind: "error", message: "Invalid URL." };
  }
}

export function validateSetupForm(form: Record<string, unknown>): SetupValidationMap {
  const result: SetupValidationMap = {};
  const identity = text(form.identity);
  if (!identity) result.identity = { kind: "error", message: "Enter an identity." };
  else if (identity.includes("..")) result.identity = { kind: "error", message: "'..' is not allowed" };
  else if (!identityPattern.test(identity)) result.identity = { kind: "error", message: "Invalid characters" };
  else result.identity = { kind: "ok", message: "Valid" };

  result.seed = validateIntegerRange(form.seed, 0, 2147483647, "Must be an integer.");
  result.worldSize = validateIntegerRange(form.worldSize, 1000, 6000, "Invalid size.");
  result.serverUrl = validateUrl(form.serverUrl);
  result.headerImageUrl = validateUrl(form.headerImageUrl);

  const portFields = ["gamePort", "queryPort", "rconPort", "webPort"] as const;
  const portValues = new Map<number, string>();
  for (const field of portFields) {
    const numeric = integerValue(form[field]);
    if (numeric === null || numeric < 1 || numeric > 65535) {
      result[field] = { kind: "error", message: "Invalid port." };
      continue;
    }
    const existing = portValues.get(numeric);
    if (existing) {
      result[field] = {
        kind: "error",
        message: field === "rconPort" && existing === "gamePort" ? "Conflicts with Game port." : `Conflicts with ${portLabel(existing)}.`
      };
      if (!result[existing] || result[existing]?.kind === "ok") {
        result[existing] = { kind: "error", message: "This port is already used." };
      }
      continue;
    }
    portValues.set(numeric, field);
    if (!result[field]) result[field] = { kind: "ok", message: "Valid" };
  }

  return result;
}

export function hasSetupValidationErrors(validation: SetupValidationMap): boolean {
  return Object.values(validation).some((entry) => entry?.kind === "error");
}
