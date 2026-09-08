import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { configPath } from "./paths";

const WeightsSchema = z
  .object({
    interruption: z.number().default(3),
    error: z.number().default(1),
    correction: z.number().default(2),
  })
  .default({ interruption: 3, error: 1, correction: 2 });

const FrictionSchema = z
  .object({
    threshold: z.number().default(5),
    weights: WeightsSchema,
  })
  .default({ threshold: 5, weights: { interruption: 3, error: 1, correction: 2 } });

export const ConfigSchema = z.object({
  remote: z.string().min(1, "remote is required"),
  branch: z.string().default("main"),
  track: z.array(z.string()).min(1, "track must list at least one path"),
  mirrors: z.array(z.string()).default([]),
  /** Agent ids to fan out to on pull. Empty = auto-detect installed agents. */
  agents: z.array(z.string()).default([]),
  /** Path prefixes (relative to root) skipped during fan-out. */
  exclude: z.array(z.string()).default([]),
  friction: FrictionSchema,
});

export type SoloteamConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(root: string): Promise<SoloteamConfig> {
  const path = configPath(root);
  if (!existsSync(path)) {
    throw new Error(`No soloteam.yaml at ${path}. Run "soloteam init <remote>" first.`);
  }
  const raw = await readFile(path, "utf8");
  const parsed = parseYaml(raw) as unknown;
  return ConfigSchema.parse(parsed);
}

export async function writeDefaultConfig(
  root: string,
  remote: string,
  track: string[],
): Promise<SoloteamConfig> {  const config = ConfigSchema.parse({
    remote,
    track,
    friction: {},
  });
  const path = configPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(config), "utf8");
  return config;
}

/** Persist an already-validated config back to soloteam.yaml. */
export async function saveConfig(root: string, config: SoloteamConfig): Promise<void> {
  const path = configPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(ConfigSchema.parse(config)), "utf8");
}
