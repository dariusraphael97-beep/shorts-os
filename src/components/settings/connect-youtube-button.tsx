'use client';

export function ConnectYouTubeButton({ connected }: { connected: boolean }) {
  return (
    <a
      href="/api/youtube/oauth/start"
      className="inline-block px-4 py-2 rounded bg-accent text-accent-foreground text-xs font-medium hover:opacity-90"
    >
      {connected ? 'Reconnect YouTube' : 'Connect YouTube'}
    </a>
  );
}
