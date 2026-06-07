// scripts/render-worker/lib/higgsfield.ts
// Live Higgsfield image generation via the official `higgsfield` CLI (@higgsfield/cli).
//
// AUTH (verified 2026-06-02): Higgsfield has NO static API key — auth is a device-login
// token stored in ~/.config/higgsfield/credentials.json ({access_token, refresh_token}).
//   • Local: the operator's existing `higgsfield auth login` session is used as-is.
//   • Headless (Vercel Sandbox): set HIGGSFIELD_TOKEN (+ optional HIGGSFIELD_REFRESH_TOKEN)
//     and this bridges it into the creds file before the first call. The sandbox must also
//     have the CLI on PATH (add `@higgsfield/cli` as a dep, or set HIGGSFIELD_CLI to its path).
//
// MODEL: chosen per style preset (verified via `higgsfield model get <model>`):
//   • "stick-figure-animated" → GPT Image 2 (gpt_image_2), quality=low + resolution=2k (~0.75 cr/img).
//     Flat crude line art needs no more; Soul V2 makes broken stickmen — do NOT use it for this preset.
//   • everything else (cinematic / editorial) → Soul V2 (text2image_soul_v2), quality=2k → 2048×1152
//     (~0.12 cr/img). 1.5k is the same price but lower res.
// NEITHER model accepts a negative-prompt param, so `negativePrompt` is kept for interface stability
// but NOT sent — negatives must be folded into the positive prompt upstream (see style-presets.ts).
//
// Any failure (disabled, auth, CLI error, timeout, bad job) returns { ok: false } so the
// handler degrades to a style-consistent gradient still — a single bad beat never fails a render.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const execFileAsync = promisify(execFile);

const CLI_BIN = process.env.HIGGSFIELD_CLI ?? "higgsfield";
const WAIT_TIMEOUT = "5m";
const EXEC_TIMEOUT_MS = 6 * 60_000;

interface ModelConfig {
  /** Higgsfield job_set_type. */
  model: string;
  /** Extra model params beyond prompt + aspect_ratio, sent as `--key value`. */
  params: Record<string, string>;
}

// Fallback per-preset model selection for OLD plans that predate dynamic styles (the style now
// carries its own model + params). Unknown presets fall back to Soul V2.
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "stick-figure-animated": { model: "gpt_image_2", params: { quality: "low", resolution: "2k" } },
  "cinematic-realistic": { model: "text2image_soul_v2", params: { quality: "2k" } },
  "editorial-graphic": { model: "text2image_soul_v2", params: { quality: "2k" } },
  "naturalist-illustration": { model: "nano_banana_2", params: { resolution: "2k" } },
};
const DEFAULT_MODEL_CONFIG: ModelConfig = MODEL_CONFIGS["cinematic-realistic"];

// Prefer the model/params the style itself specifies (dynamic styles from the Style Scout);
// fall back to the preset map for older plans that don't carry them.
function resolveModelConfig(args: GenerateImageArgs): ModelConfig {
  if (args.model) return { model: args.model, params: args.imageParams ?? {} };
  return MODEL_CONFIGS[args.presetId] ?? DEFAULT_MODEL_CONFIG;
}

export interface GenerateImageArgs {
  prompt: string;
  /** Most image models have no negative-prompt param — kept for interface stability / future models. */
  negativePrompt: string;
  outputPath: string;
  /** 16:9 target. */
  aspect: "16:9";
  /** Style preset id — used as the model fallback for plans without an explicit model. */
  presetId: string;
  /** Higgsfield job_set_type from the style (dynamic styles); overrides the preset map. */
  model?: string;
  /** Model params (e.g. {quality,resolution}) from the style; sent as `--key value`. */
  imageParams?: Record<string, string>;
}

export interface GenerateImageResult { ok: boolean; reason?: string }

function isEnabled(): boolean {
  // Auth comes from the creds file (local) or HIGGSFIELD_TOKEN (headless) — NOT a static API key.
  return process.env.HIGGSFIELD_ENABLED === "1";
}

let credsBridged = false;
// Headless bridge: write ~/.config/higgsfield/credentials.json from env if it isn't already present.
async function ensureCreds(): Promise<void> {
  if (credsBridged) return;
  credsBridged = true;
  const token = process.env.HIGGSFIELD_TOKEN;
  if (!token) return; // local dev: rely on the operator's existing `higgsfield auth login` session
  const path = join(homedir(), ".config", "higgsfield", "credentials.json");
  try { await access(path); return; } catch { /* not present — write it */ }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ access_token: token, refresh_token: process.env.HIGGSFIELD_REFRESH_TOKEN ?? "" }),
    { mode: 0o600 },
  );
}

export async function generateImage(args: GenerateImageArgs): Promise<GenerateImageResult> {
  if (!isEnabled()) return { ok: false, reason: "higgsfield disabled (HIGGSFIELD_ENABLED!=1)" };
  try {
    await ensureCreds();
    const url = await callHiggsfield(args.prompt, resolveModelConfig(args));
    await downloadTo(url, args.outputPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// Create one 16:9 image job (model per preset), wait for it, and return the result image URL.
// One bounded retry, but only on a pre-job transient failure (spawn/network/timeout) — never
// re-run after a job may have been created, to avoid double-charging credits.
async function callHiggsfield(prompt: string, cfg: ModelConfig): Promise<string> {
  const args = [
    "generate", "create", cfg.model,
    "--prompt", prompt,
    "--aspect_ratio", "16:9",
    ...Object.entries(cfg.params).flatMap(([k, v]) => [`--${k}`, v]),
    "--wait", "--wait-timeout", WAIT_TIMEOUT,
    "--json",
  ];
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(CLI_BIN, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }));
  } catch (e1) {
    // Transient (CLI not found / network / spawn) — one retry. A genuine --wait timeout is
    // extremely unlikely (these image jobs finish in tens of seconds vs a 5m budget), so this
    // won't normally double-charge.
    ({ stdout } = await execFileAsync(CLI_BIN, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }));
  }
  const arr = JSON.parse(stdout) as Array<{ status?: string; result_url?: string }>;
  const job = arr?.[0];
  if (!job?.result_url || job.status !== "completed") {
    throw new Error(`higgsfield job not completed: ${stdout.slice(0, 240)}`);
  }
  return job.result_url;
}

async function downloadTo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download failed ${res.status}`);
  await writeFile(outputPath, Buffer.from(await res.arrayBuffer()));
}
