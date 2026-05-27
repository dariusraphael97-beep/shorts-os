// scripts/render-worker/handlers/render-f2.ts
//
// Phase 4: full render_f2 handler.
//   1. Fetch compilation_drafts row + referenced clip_library rows + music_tracks
//   2. Download each clip + music from Blob to /tmp
//   3. Trim each clip to its [start_sec, end_sec] window (vertical 1080×1920)
//   4. ffmpeg concat the 5 trimmed clips into one mp4
//   5. Composite title bar + numbered overlays + duck music to 20%, mux
//   6. Probe duration, upload to Blob, return for callback
//
// Trace pattern mirrors render-f1.ts:RenderF1Error so the callback handler can
// persist a per-stage timing string to render_jobs.last_error on both success
// and failure paths (worker stdout is unreachable per Phase 2 lesson #3).

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import {
  buildTrimArgs,
  buildConcatListFile,
  buildCompositeArgs,
  type F2ClipRef,
} from '../lib/compile-f2.ts';

export class RenderF2Error extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'RenderF2Error';
  }
}

interface DraftRow {
  id: string;
  title_template: string;
  layout_variant: 'top5_sidebar' | 'top5_overlay';
  clip_refs: F2ClipRef[];
  music_track_id: string | null;
}

export async function runRenderF2(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[render_f2] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await renderInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new RenderF2Error(msg, trace.join('\n'));
  }

  async function renderInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as { compilation_draft_id?: string };
    const draftId = payload.compilation_draft_id;
    if (!draftId) throw new Error('payload.compilation_draft_id missing');

    log(`fetching draft ${draftId}`);
    const { data: draftData, error: draftErr } = await supabase
      .from('compilation_drafts')
      .select('id,title_template,layout_variant,clip_refs,music_track_id')
      .eq('id', draftId)
      .maybeSingle();
    if (draftErr) throw new Error(`compilation_drafts fetch: ${draftErr.message}`);
    if (!draftData) throw new Error(`draft ${draftId} not found`);
    const draft = draftData as DraftRow;
    if (!Array.isArray(draft.clip_refs) || draft.clip_refs.length !== 5) {
      throw new Error(`clip_refs must be 5, got ${draft.clip_refs?.length ?? 0}`);
    }
    if (!draft.music_track_id) throw new Error('draft.music_track_id missing');

    const sortedRefs = [...draft.clip_refs].sort((a, b) => a.order - b.order);

    // Fetch clip + music in parallel.
    const clipIds = sortedRefs.map((r) => r.clip_id);
    const [{ data: clipRows, error: clipErr }, { data: musicRow, error: musicErr }] = await Promise.all([
      supabase.from('clip_library').select('id,local_path').in('id', clipIds),
      supabase.from('music_tracks').select('id,local_path').eq('id', draft.music_track_id).maybeSingle(),
    ]);
    if (clipErr) throw new Error(`clip_library fetch: ${clipErr.message}`);
    if (!clipRows || clipRows.length !== 5) {
      throw new Error(`clip_library returned ${clipRows?.length ?? 0} rows for 5 ids`);
    }
    if (musicErr) throw new Error(`music_tracks fetch: ${musicErr.message}`);
    if (!musicRow) throw new Error(`music ${draft.music_track_id} not found`);
    const clipById = new Map(
      (clipRows as Array<{ id: string; local_path: string }>).map((c) => [c.id, c.local_path]),
    );

    // Working directory
    const tmp = `/tmp/f2-${draftId}`;
    await mkdir(tmp, { recursive: true });
    log(`workdir ${tmp}`);

    // Download + trim each clip serially (sandbox memory budget).
    const trimmedPaths: string[] = [];
    for (let i = 0; i < sortedRefs.length; i++) {
      const ref = sortedRefs[i];
      const srcUrl = clipById.get(ref.clip_id);
      if (!srcUrl) throw new Error(`clip ${ref.clip_id} has no local_path`);
      const dlPath = join(tmp, `src_${i + 1}.mp4`);
      const trimmedPath = join(tmp, `clip_${i + 1}.mp4`);
      await downloadToFile(srcUrl, dlPath);
      const dlStat = await stat(dlPath);
      log(`clip ${i + 1}/5 downloaded ${(dlStat.size / 1024 / 1024).toFixed(1)}MB`);
      await runFfmpeg(buildTrimArgs(dlPath, trimmedPath, ref.start_sec, ref.end_sec));
      log(`clip ${i + 1}/5 trimmed [${ref.start_sec},${ref.end_sec}]`);
      trimmedPaths.push(trimmedPath);
    }

    // Download music
    const musicLocal = (musicRow as { local_path: string }).local_path;
    const musicPath = join(tmp, 'music.mp3');
    await downloadToFile(musicLocal, musicPath);
    log(`music downloaded`);

    // Concat trimmed clips (stream copy because they share codec)
    const listPath = join(tmp, 'list.txt');
    await writeFile(listPath, buildConcatListFile(trimmedPaths));
    const concatPath = join(tmp, 'concat.mp4');
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatPath]);
    log(`concatenated 5 trims`);

    // Composite title + labels + ducked music
    const outputPath = join(tmp, 'out.mp4');
    await runFfmpeg(
      buildCompositeArgs({
        concatVideoPath: concatPath,
        musicPath,
        refs: sortedRefs,
        titleTemplate: draft.title_template,
        layoutVariant: draft.layout_variant,
        outputPath,
      }),
    );
    const outStat = await stat(outputPath);
    log(`composited ${(outStat.size / 1024 / 1024).toFixed(1)}MB`);

    // Probe final duration
    const durationActual = await probeDurationSeconds(outputPath);
    log(`probed duration ${durationActual.toFixed(2)}s`);

    // Upload to Blob (overwrite-safe path keyed by draft id)
    const renderedUrl = await uploadMp4ToBlob(outputPath, `renders/compilation/${draftId}.mp4`);
    log(`uploaded ${renderedUrl}`);

    return {
      compilation_draft_id: draftId,
      rendered_path: renderedUrl,
      duration_seconds_actual: durationActual,
      debug_trace: trace.join('\n'),
    };
  }
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

const FFMPEG_PATH =
  (ffmpegStatic as unknown as string | null) ?? '/usr/bin/ffmpeg';

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cp = spawn(FFMPEG_PATH, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    cp.on('error', reject);
    cp.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}
