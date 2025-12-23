'use client';

import { Music2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';

type SpotifyConnectionProps = {
  isConnected: boolean;
  displayName?: string;
  onDisconnect: () => void;
};

export function SpotifyConnection({
  isConnected,
}: SpotifyConnectionProps) {
  // Don't show anything when connected - the app is ready to use
  if (isConnected) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Music2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Connect your Spotify account</p>
            <p className="text-muted-foreground text-sm">
              Required to access your recently played songs and playlists
            </p>
          </div>
        </div>
        <Button asChild>
          <a href="/api/spotify/auth">Connect Spotify</a>
        </Button>
      </CardContent>
    </Card>
  );
}

