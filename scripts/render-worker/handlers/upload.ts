// scripts/render-worker/handlers/upload.ts
// Phase 5: real YouTube upload.
//   1. Load your_videos row + channel.oauth_refresh_token_encrypted
//   2. Decrypt + refresh to get access token
//   3. Download MP4 from render_artifact_url (Vercel Blob signed URL works as-is)
//   4. Resumable upload via youtube-upload.ts
//   5. Return { your_video_id, external_video_id, url } for the callback handler
//      to write back to your_videos.

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, type EncryptedSecret } from '../lib/encryption.ts';
import { refreshAccessToken, GoogleTokenError } from '../lib/google-oauth.ts';
import { uploadVideo, YouTubeUploadError } from '../lib/youtube-upload.ts';

export class UploadHandlerError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'UploadHandlerError';
  }
}

interface VideoRow {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  render_artifact_url: string | null;
}

export async function runUpload(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[upload] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await uploadInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new UploadHandlerError(msg, trace.join('\n'));
  }

  async function uploadInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as { your_video_id?: string };
    const videoId = payload.your_video_id;
    if (!videoId) throw new Error('payload.your_video_id missing');

    log(`loading your_videos ${videoId}`);
    const { data: vidData, error: vidErr } = await supabase
      .from('your_videos')
      .select('id, channel_id, title, description, render_artifact_url')
      .eq('id', videoId)
      .single();
    if (vidErr || !vidData) throw new Error(`your_videos fetch: ${vidErr?.message ?? 'no row'}`);
    const video = vidData as VideoRow;
    if (!video.render_artifact_url) throw new Error('render_artifact_url is null');

    log(`loading channel ${video.channel_id}`);
    const { data: chanData, error: chanErr } = await supabase
      .from('channels')
      .select('oauth_refresh_token_encrypted')
      .eq('id', video.channel_id)
      .single();
    if (chanErr || !chanData) throw new Error(`channels fetch: ${chanErr?.message ?? 'no row'}`);
    const encJSON = (chanData as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted;
    if (!encJSON) throw new Error('channel has no oauth_refresh_token_encrypted — connect at /settings/channel');
    const blob = JSON.parse(encJSON) as EncryptedSecret;
    const refreshToken = decryptSecret(blob);

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET missing in sandbox env');

    log('refreshing access token');
    let accessToken: string;
    try {
      const refreshed = await refreshAccessToken({ refreshToken, clientId, clientSecret });
      accessToken = refreshed.accessToken;
    } catch (err) {
      if (err instanceof GoogleTokenError) throw new Error(`token refresh: ${err.message}`);
      throw err;
    }

    log(`downloading mp4 from ${video.render_artifact_url}`);
    const dlRes = await fetch(video.render_artifact_url);
    if (!dlRes.ok) throw new Error(`mp4 download: ${dlRes.status}`);
    const videoBytes = new Uint8Array(await dlRes.arrayBuffer());
    log(`downloaded ${videoBytes.byteLength} bytes`);

    log('uploading to YouTube');
    let result;
    try {
      result = await uploadVideo({
        accessToken,
        videoBytes,
        title: video.title,
        description: video.description ?? '',
        tags: [],
        privacyStatus: 'public',
        madeForKids: false,
        categoryId: '24',
      });
    } catch (err) {
      if (err instanceof YouTubeUploadError) throw new Error(`youtube upload: ${err.message}`);
      throw err;
    }
    log(`uploaded as ${result.externalVideoId}`);

    return {
      your_video_id: videoId,
      external_video_id: result.externalVideoId,
      url: result.url,
      debug_trace: trace.join('\n'),
    };
  }
}
