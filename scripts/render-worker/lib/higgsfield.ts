// scripts/render-worker/lib/higgsfield.ts
// Gated Higgsfield (GPT-Image-class) generation. The live CLI/API wiring is deferred to
// Darius's paid plan; until HIGGSFIELD_ENABLED is set with a working credential, this
// returns { ok: false } and the handler falls back to a style-consistent gradient still.

export interface GenerateImageArgs {
  prompt: string;
  negativePrompt: string;
  outputPath: string;
  /** 16:9 target; the model is asked for the widest native aspect it supports. */
  aspect: "16:9";
}

export interface GenerateImageResult { ok: boolean; reason?: string }

function isEnabled(): boolean {
  return process.env.HIGGSFIELD_ENABLED === "1" && Boolean(process.env.HIGGSFIELD_API_KEY || process.env.HIGGSFIELD_TOKEN);
}

export async function generateImage(args: GenerateImageArgs): Promise<GenerateImageResult> {
  if (!isEnabled()) return { ok: false, reason: "higgsfield disabled (no credential)" };
  // DEFERRED: wire the Higgsfield CLI/API here (auth via HIGGSFIELD_TOKEN), write a 1920x1080
  // PNG to args.outputPath using args.prompt/args.negativePrompt, then `return { ok: true }`.
  // One bounded retry on transient failure; on hard failure return { ok: false } to degrade.
  try {
    await callHiggsfield(args);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// Placeholder for the deferred live integration. Throws until wired so callers degrade safely.
async function callHiggsfield(_args: GenerateImageArgs): Promise<void> {
  throw new Error("higgsfield live integration not yet wired (deferred CLI-auth)");
}
