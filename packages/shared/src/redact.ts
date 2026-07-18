const SECRET_PATTERNS = [
  /(\+rcon\.password\s+)(?:"[^"]*"|\S+)/gi,
  /(rconPassword["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi,
  /(password["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi
];

export function redactSecret(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "$1[REDACTED]"), value);
}

export function redactArgs(args: string[]): string[] {
  const redacted = [...args];
  for (let index = 0; index < redacted.length; index += 1) {
    if (redacted[index]?.toLowerCase() === "+rcon.password" && redacted[index + 1]) {
      redacted[index + 1] = "[REDACTED]";
    }
  }
  return redacted.map(redactSecret);
}
