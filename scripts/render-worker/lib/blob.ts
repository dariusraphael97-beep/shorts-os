// scripts/render-worker/lib/blob.ts
import { put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';

export async function uploadMp4ToBlob(localPath: string, blobPath: string): Promise<string> {
  const buffer = await readFile(localPath);
  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: 'video/mp4',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
