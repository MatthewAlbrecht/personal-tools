import { type NextRequest, NextResponse } from 'next/server';
import { addTracksToPlaylist, trackToUri } from '~/lib/spotify';

type AddToPlaylistsRequest = {
  trackId: string;
  playlistIds: string[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.headers.get('X-Access-Token');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AddToPlaylistsRequest;
    const { trackId, playlistIds } = body;

    if (!trackId || !playlistIds?.length) {
      return NextResponse.json(
        { error: 'Missing trackId or playlistIds' },
        { status: 400 }
      );
    }

    const trackUri = trackToUri(trackId);
    const results: Array<{ playlistId: string; success: boolean; error?: string }> = [];

    // Add to each playlist sequentially to avoid rate limits
    for (const playlistId of playlistIds) {
      try {
        await addTracksToPlaylist(accessToken, playlistId, [trackUri]);
        results.push({ playlistId, success: true });
      } catch (error) {
        console.error(`Failed to add track to playlist ${playlistId}:`, error);
        results.push({
          playlistId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: allSuccess,
      results,
      message: allSuccess
        ? `Added to ${successCount} playlist${successCount !== 1 ? 's' : ''}`
        : `Added to ${successCount}/${playlistIds.length} playlists`,
    });
  } catch (error) {
    console.error('Error adding to playlists:', error);
    return NextResponse.json(
      { error: 'Failed to add to playlists' },
      { status: 500 }
    );
  }
}

