'use client';

import { MonitorPlay, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectYouTubeButton({ connected }: { connected: boolean }) {
  // Behavior preserved exactly: a link that starts the YouTube OAuth flow.
  // `connected` only changes the label/icon between Connect and Reconnect.
  return (
    <Button
      render={<a href="/api/youtube/oauth/start" />}
      variant={connected ? 'outline' : 'default'}
      size="sm"
      className="gap-1.5"
    >
      {connected ? (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
      )}
      {connected ? 'Reconnect YouTube' : 'Connect YouTube'}
    </Button>
  );
}
