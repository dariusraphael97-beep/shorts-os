// src/lib/render/workers/vercel-sandbox.ts
//
// VercelSandboxRenderWorker — the only RenderWorker impl in Plan #4.
// Boots a Sandbox microVM with the repo git source pre-cloned by the SDK,
// npm-installs the worker package, runs the entrypoint detached, returns the
// sandbox name as the invocation id. The sandbox writes back via
// /api/render/complete; this worker does not wait.
//
// Code-into-sandbox mechanism: Sandbox.create({ source: { type: "git", ... } })
// — the SDK clones & checks out the repo before the first session command runs.
// This is the documented TS discriminated-union source option (available in
// @vercel/sandbox >=0.x GA 2026-01).
//
// Repo ref: VERCEL_GIT_COMMIT_SHA auto-populated on every Vercel deployment.
// Repo URL: constructed from VERCEL_GIT_REPO_OWNER + VERCEL_GIT_REPO_SLUG (Vercel
// doesn't expose VERCEL_GIT_REPO_URL directly). Override with SANDBOX_GIT_URL for
// local dev or non-GitHub providers. For private repos, set SANDBOX_GIT_USERNAME +
// SANDBOX_GIT_PASSWORD (the Sandbox SDK supports username/password git auth).
import 'server-only';
import { Sandbox } from '@vercel/sandbox';
import type { RenderWorker } from './types';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

function getGitSource(): { url: string; ref: string; username?: string; password?: string } {
  const url =
    process.env.SANDBOX_GIT_URL ??
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}.git`
      : undefined);
  const ref = process.env.SANDBOX_GIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!url || !ref) {
    throw new Error(
      'Cannot determine Sandbox git source. Set SANDBOX_GIT_URL + SANDBOX_GIT_REF for local dev, ' +
      'or deploy to Vercel where VERCEL_GIT_REPO_OWNER + VERCEL_GIT_REPO_SLUG + VERCEL_GIT_COMMIT_SHA ' +
      'are auto-populated.',
    );
  }
  return {
    url,
    ref,
    username: process.env.SANDBOX_GIT_USERNAME,
    password: process.env.SANDBOX_GIT_PASSWORD,
  };
}

export class VercelSandboxRenderWorker implements RenderWorker {
  async dispatch(job: RenderJobRow, jobToken: string): Promise<{ invocationId: string }> {
    const { url: repoUrl, ref: gitRef, username, password } = getGitSource();
    const sandboxEnv: Record<string, string> = {
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      CARTESIA_API_KEY: process.env.CARTESIA_API_KEY ?? '',
      PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? '',
      GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ?? '',
      RENDER_CALLBACK_BASE_URL: process.env.RENDER_CALLBACK_BASE_URL ?? '',
      OAUTH_TOKEN_ENCRYPTION_KEY_V1: process.env.OAUTH_TOKEN_ENCRYPTION_KEY_V1 ?? '',
      OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION: process.env.OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION ?? '',
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      YTDLP_COOKIES_B64: process.env.YTDLP_COOKIES_B64 ?? '',
    };

    // source option clones + checks out the repo before the first command runs.
    const sandbox = await Sandbox.create({
      name: job.id,                          // for later Sandbox.get({ name }) lookups
      runtime: 'node24',                     // node24 is current Vercel default (2026)
      timeout: 15 * 60 * 1000,               // milliseconds (15 minutes)
      source: username && password
        ? { type: 'git', url: repoUrl, revision: gitRef, username, password }
        : { type: 'git', url: repoUrl, revision: gitRef },
    });

    // Bootstrap (blocking): install worker package deps.
    // Caps at ~60s per Phase 1 benchmark gate.
    await sandbox.runCommand({
      cmd: 'npm',
      args: ['ci', '--prefix', 'scripts/render-worker'],
    });

    // Detached: returns immediately; the sandbox continues executing and posts
    // back to /api/render/complete when run.ts finishes.
    //
    // cwd: must be scripts/render-worker so node resolves `tsx` from the
    // worker package's node_modules (it's not in the repo root's deps).
    await sandbox.runCommand({
      cmd: 'node',
      args: ['--import', 'tsx', 'run.ts', job.id, jobToken],
      cwd: '/vercel/sandbox/scripts/render-worker',
      detached: true,
      env: { ...sandboxEnv, VERCEL_SANDBOX_NAME: sandbox.name },
    });

    return { invocationId: sandbox.name };
  }
}
