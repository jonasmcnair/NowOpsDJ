// app/api/auth/route.ts
// Initiates Spotify OAuth2 Authorization Code Flow

import { NextResponse } from 'next/server';

const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private',
  'user-read-email',
].join(' ');

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'SPOTIFY_CLIENT_ID not configured' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/callback`;

  // Generate a random state value for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'false',
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;

  return NextResponse.redirect(authUrl);
}
