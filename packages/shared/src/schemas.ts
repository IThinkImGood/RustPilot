import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65535);
const optionalHttpUrl = z
  .union([z.literal(""), z.string().url()])
  .refine((value) => value === "" || value.startsWith("http://") || value.startsWith("https://"), {
    message: "Use a valid http or https URL."
  });

export const serverSettingsSchema = z
  .object({
    identity: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, "Use only letters, numbers, _ and -.")
      .refine((value) => !value.includes(".."), "Identity cannot contain ..")
      .refine((value) => !/[\\/]/.test(value), "Identity cannot contain path separators."),
    installDirectory: z.string().max(260).default(""),
    hostname: z.string().min(1).max(120),
    description: z.string().max(1024).default(""),
    maxPlayers: z.coerce.number().int().min(1).max(1000),
    gamePort: portSchema,
    queryPort: portSchema,
    rconPort: portSchema,
    webPort: portSchema.default(40815),
    rconPassword: z.string().min(8).max(256),
    worldSize: z.coerce.number().int().min(1000).max(6000),
    seed: z.coerce.number().int().min(0).max(2147483647),
    saveInterval: z.coerce.number().int().min(60).max(3600),
    serverUrl: optionalHttpUrl.default(""),
    headerImageUrl: optionalHttpUrl.default(""),
    autoStart: z.boolean().default(false),
    openBrowser: z.boolean().default(true),
    gracefulShutdownTimeoutSeconds: z.coerce.number().int().min(5).max(300).default(30)
  })
  .superRefine((settings, ctx) => {
    const ports = [
      ["gamePort", settings.gamePort],
      ["queryPort", settings.queryPort],
      ["rconPort", settings.rconPort],
      ["webPort", settings.webPort]
    ] as const;
    const seen = new Map<number, string>();
    for (const [name, port] of ports) {
      const existing = seen.get(port);
      if (existing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `Port conflicts with ${existing}.`
        });
      }
      seen.set(port, name);
    }
  });

export type ServerSettings = z.infer<typeof serverSettingsSchema>;

export const defaultServerSettings: ServerSettings = {
  identity: "default",
  installDirectory: "",
  hostname: "RustPilot Server",
  description: "",
  maxPlayers: 50,
  gamePort: 28015,
  queryPort: 28016,
  rconPort: 28017,
  webPort: 40815,
  rconPassword: "change-this-password",
  worldSize: 4000,
  seed: 12345,
  saveInterval: 300,
  serverUrl: "",
  headerImageUrl: "",
  autoStart: false,
  openBrowser: true,
  gracefulShutdownTimeoutSeconds: 30
};

export const commandRequestSchema = z.object({
  command: z.string().min(1).max(500)
});

export const restartScheduleSchema = z.object({
  enabled: z.boolean(),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time.")).max(12),
  reason: z.union([z.literal(""), z.string().max(160)]).nullable().default(null)
}).superRefine((schedule, ctx) => {
  if (schedule.enabled && schedule.times.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["times"],
      message: "Add at least one restart time."
    });
  }
  const uniqueTimes = new Set(schedule.times);
  if (uniqueTimes.size !== schedule.times.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["times"],
      message: "Restart times must be unique."
    });
  }
});

export const settingsUpdateSchema = serverSettingsSchema;
