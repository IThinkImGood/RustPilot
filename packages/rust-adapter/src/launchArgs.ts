import { redactArgs, type ServerSettings } from "@rustpilot/shared";

export function generateLaunchArguments(settings: ServerSettings): string[] {
  const args = [
    "-batchmode",
    "-nographics",
    "+server.identity",
    settings.identity,
    "+server.hostname",
    settings.hostname,
    "+server.description",
    settings.description,
    "+server.maxplayers",
    String(settings.maxPlayers),
    "+server.port",
    String(settings.gamePort),
    "+server.queryport",
    String(settings.queryPort),
    "+server.worldsize",
    String(settings.worldSize),
    "+server.seed",
    String(settings.seed),
    "+server.saveinterval",
    String(settings.saveInterval),
    "+rcon.port",
    String(settings.rconPort),
    "+rcon.password",
    settings.rconPassword,
    "+rcon.web",
    "1"
  ];

  if (settings.serverUrl) {
    args.push("+server.url", settings.serverUrl);
  }

  if (settings.headerImageUrl) {
    args.push("+server.headerimage", settings.headerImageUrl);
  }

  return args;
}

export function generateRedactedLaunchArguments(settings: ServerSettings): string[] {
  return redactArgs(generateLaunchArguments(settings));
}
