import { type NextRequest, NextResponse } from 'next/server';
import { getLikedTracks } from '~/lib/spotify';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.headers.get('X-Access-Token');
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  try {
    const data = await getLikedTracks(accessToken, 50, offset);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching liked tracks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch liked tracks' },
      { status: 500 }
    );
  }
}

