import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { env } from '~/env.js';

export async function POST(request: NextRequest) {
  try {
    const devUrl = env.NEXT_PUBLIC_CONVEX_URL;
    const prodUrl = env.NEXT_PUBLIC_CONVEX_PROD_URL;

    if (!prodUrl) {
      return NextResponse.json(
        { error: 'Production Convex URL not configured' },
        { status: 500 }
      );
    }

    const devClient = new ConvexHttpClient(devUrl);
    const prodClient = new ConvexHttpClient(prodUrl);

    console.log('Fetching existing albums from prod...');
    const prodAlbums = await prodClient.query(api.geniusAlbums.listRecent, {
      limit: 1000,
    });
    const prodSlugs = new Set(prodAlbums.map((a) => a.albumSlug));

    console.log('Fetching albums from dev...');
    const devAlbums = await devClient.query(api.geniusAlbums.listRecent, {
      limit: 1000,
    });

    let skipped = 0;
    let created = 0;

    for (const album of devAlbums) {
      // Check if album already exists in prod
      if (prodSlugs.has(album.albumSlug)) {
        console.log(
          `Skipping: ${album.artistName} - ${album.albumTitle} (already exists)`
        );
        skipped++;
        continue;
      }

      console.log(`Migrating: ${album.artistName} - ${album.albumTitle}`);

      // Fetch songs for this album from dev
      const devSongs = await devClient.query(api.geniusAlbums.getAlbumBySlug, {
        slug: album.albumSlug,
      });

      if (!devSongs?.songs) {
        console.log(`No songs found for ${album.albumSlug}, skipping`);
        continue;
      }

      // Create album in prod
      const prodAlbumId = await prodClient.mutation(
        api.geniusAlbums.createAlbum,
        {
          albumTitle: album.albumTitle,
          artistName: album.artistName,
          albumSlug: album.albumSlug,
          geniusAlbumUrl: album.geniusAlbumUrl,
          totalSongs: album.totalSongs,
        }
      );

      console.log(`Created album in prod: ${prodAlbumId}`);

      // Create songs in prod
      for (const song of devSongs.songs) {
        await prodClient.mutation(api.geniusAlbums.createSong, {
          albumId: prodAlbumId,
          songTitle: song.songTitle,
          geniusSongUrl: song.geniusSongUrl,
          trackNumber: song.trackNumber,
          lyrics: song.lyrics,
          about: song.about,
        });
      }

      console.log(`Created ${devSongs.songs.length} songs`);
      created++;
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: devAlbums.length,
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Migration failed',
      },
      { status: 500 }
    );
  }
}
