import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const nextAuthUrl = process.env.NEXTAUTH_URL;

  if (!clientId || !nextAuthUrl) {
    return new NextResponse(`Missing env vars: CLIENT_ID=${!!clientId} URL=${!!nextAuthUrl}`, { status: 500 });
  }

  const SCOPES = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-read-private',
    'user-read-email',
  ].join(' ');

  const redirectUri = `${nextAuthUrl}/api/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'false',
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
