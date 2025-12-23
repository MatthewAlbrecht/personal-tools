import { env } from '~/env.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = [
  'user-read-recently-played',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private',
  'user-read-email',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export function GET(): Response {
  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    show_dialog: 'true',
  });

  return Response.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
}

function getRedirectUri(): string {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://127.0.0.1:1333';
  return `${baseUrl}/api/spotify/callback`;
}
