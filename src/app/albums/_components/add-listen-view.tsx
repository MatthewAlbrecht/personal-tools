'use client';

import Image from 'next/image';
import { Disc3, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '~/components/ui/drawer';

type TrackInfo = {
  trackName: string;
  artistName: string;
  albumName?: string;
  albumImageUrl?: string;
  spotifyAlbumId?: string;
  lastPlayedAt?: number;
};

type AddListenDrawerProps = {
  track: TrackInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (listenedAt: number) => Promise<void>;
  isSaving: boolean;
};

// Quick date options
const DATE_OPTIONS = [
  { label: 'Today', getDays: () => 0 },
  { label: 'Yesterday', getDays: () => 1 },
  { label: '2 days ago', getDays: () => 2 },
  { label: '3 days ago', getDays: () => 3 },
  { label: 'Last week', getDays: () => 7 },
  { label: '2 weeks ago', getDays: () => 14 },
  { label: 'Last month', getDays: () => 30 },
  { label: '2 months ago', getDays: () => 60 },
  { label: '3 months ago', getDays: () => 90 },
] as const;

function getDateFromDaysAgo(daysAgo: number): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0); // Noon to avoid timezone issues
  return date.getTime();
}

export function AddListenDrawer({
  track,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: AddListenDrawerProps) {
  function handleOptionClick(daysAgo: number) {
    if (isSaving) return;
    const listenedAt = getDateFromDaysAgo(daysAgo);
    onSave(listenedAt);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader className="text-center">
            {/* Album Art */}
            <div className="mx-auto mb-2 h-20 w-20 overflow-hidden rounded-lg bg-muted shadow-md">
              {track?.albumImageUrl ? (
                <Image
                  src={track.albumImageUrl}
                  alt={track.albumName ?? track.trackName}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Disc3 className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
            </div>
            <DrawerTitle>{track?.albumName ?? 'Unknown Album'}</DrawerTitle>
            <DrawerDescription>{track?.artistName}</DrawerDescription>
          </DrawerHeader>

          {/* Date Options */}
          <div className="p-4 pb-8">
            <p className="mb-3 text-center text-muted-foreground text-sm">
              When did you listen?
            </p>

            {isSaving ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Adding listen...</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {DATE_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => handleOptionClick(option.getDays())}
                    disabled={isSaving}
                    className="whitespace-nowrap rounded-lg border border-muted-foreground/20 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary active:bg-primary active:text-primary-foreground"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
