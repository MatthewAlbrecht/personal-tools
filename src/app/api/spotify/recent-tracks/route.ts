import { type NextRequest, NextResponse } from 'next/server';
import { getRecentlyPlayed } from '~/lib/spotify';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.headers.get('X-Access-Token');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  try {
    const items = await getRecentlyPlayed(accessToken, 50);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching recent tracks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent tracks' },
      { status: 500 }
    );
  }
}
