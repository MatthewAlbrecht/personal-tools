import type { Id } from 'convex/_generated/dataModel';

export type RankingStatus = 'none' | 'locked' | 'confirmed';

export type RankingAlbum = {
  _id: Id<'robRankingAlbums'>;
  albumId: Id<'spotifyAlbums'>;
  position: number;
  status: RankingStatus;
  album: {
    name: string;
    artistName: string;
    imageUrl?: string;
    releaseDate?: string;
  } | null;
};

export type AvailableAlbum = {
  _id: Id<'spotifyAlbums'>;
  spotifyAlbumId: string;
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
  totalTracks: number;
};

export type Bucket = {
  label: string;
  start: number; // inclusive
  end: number; // inclusive
};

export const BUCKETS: Bucket[] = [
  { label: '1-10', start: 1, end: 10 },
  { label: '11-20', start: 11, end: 20 },
  { label: '21-30', start: 21, end: 30 },
  { label: '31-40', start: 31, end: 40 },
  { label: '41-50', start: 41, end: 50 },
];

export function getBucketForPosition(position: number): Bucket | undefined {
  return BUCKETS.find((b) => position >= b.start && position <= b.end);
}
