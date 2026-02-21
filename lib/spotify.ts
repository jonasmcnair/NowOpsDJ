// lib/spotify.ts
const SPOTIFY_BASE = 'https://api.spotify.com/v1';

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  popularity: number;
  uri: string;
  tempo?: number;
  energy?: number;
  danceability?: number;
  key?: number;
  mode?: number;
}

export interface AudioFeatures {
  id: string;
  tempo: number;
  energy: number;
  danceability: number;
  key: number;
  mode: number;
  valence: number;
}

const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

export function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

export function formatBPM(tempo: number): string {
  return Math.round(tempo).toString();
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/callback`;
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: params,
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: params,
  });
  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}

export async function searchTracks(query: string, accessToken: string, limit = 20): Promise<SpotifyTrack[]> {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.tracks.items;
}
