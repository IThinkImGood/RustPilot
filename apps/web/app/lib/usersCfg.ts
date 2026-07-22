export type UsersCfgRole = "ownerid" | "moderatorid";

export function isSteamId64(value: string): boolean {
  return /^\d{17}$/.test(value.trim());
}

export function buildUsersCfgLine(role: UsersCfgRole, steamId: string, playerName: string, note: string): string {
  const cleanSteamId = steamId.trim();
  if (!isSteamId64(cleanSteamId)) throw new Error("SteamID64 must be 17 digits.");
  const cleanName = playerName.trim() || (role === "ownerid" ? "Owner" : "Moderator");
  const cleanNote = note.trim() || (role === "ownerid" ? "Owner" : "Moderator");
  return `${role} ${cleanSteamId} "${escapeUsersCfgValue(cleanName)}" "${escapeUsersCfgValue(cleanNote)}"`;
}

function escapeUsersCfgValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ").trim();
}
