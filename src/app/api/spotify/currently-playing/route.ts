import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentlyPlaying } from '~/lib/spotify';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.headers.get('X-Access-Token');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  try {
    const currentlyPlaying = await getCurrentlyPlaying(accessToken);
    return NextResponse.json({ currentlyPlaying });
  } catch (error) {
    console.error('Error fetching currently playing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch currently playing' },
      { status: 500 }
    );
  }
}

