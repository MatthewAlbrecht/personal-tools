import { type NextRequest, NextResponse } from 'next/server';
import { createPlaylist } from '~/lib/spotify';

type CreatePlaylistRequest = {
  spotifyUserId: string;
  name: string;
  description?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.headers.get('X-Access-Token');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreatePlaylistRequest;
    const { spotifyUserId, name, description } = body;

    if (!spotifyUserId || !name) {
      return NextResponse.json(
        { error: 'Missing spotifyUserId or name' },
        { status: 400 }
      );
    }

    const playlist = await createPlaylist(
      accessToken,
      spotifyUserId,
      name,
      description,
      false // private by default
    );

    return NextResponse.json({ playlist });
  } catch (error) {
    console.error('Error creating playlist:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

