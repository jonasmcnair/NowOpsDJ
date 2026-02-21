// lib/spotify.ts
// Spotify Web API utility functions

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  popularity: number;
  uri: string;
  // Audio features (fetched separately)
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

// Camelot wheel mapping: key (0-11) + mode (0=minor,1=major) → Camelot label
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

// Exchange authorization code for tokens
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

// Refresh an expired access token
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

// Search tracks by query string
export async function searchTracks(query: string, accessToken: string, limit = 20): Promise<SpotifyTrack[]> {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.tracks.items;
}

// Get recommendations from Spotify
export async function getRecommendations(
  seedTrackIds: string[],
  accessToken: string,
  targetEnergy = 0.8,
  targetDanceability = 0.75,
  limit = 20
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    seed_tracks: seedTrackIds.slice(0, 5).join(','),
    target_energy: targetEnergy.toString(),
    target_danceability: targetDanceability.toString(),
    min_energy: '0.5',
    min_danceability: '0.5',
    limit: limit.toString(),
  });
  const url = `${SPOTIFY_BASE}/recommendations?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Recommendations failed');
  const data = await res.json();
  return data.tracks;
}

// Get recommendations by genre/vibe (no seed track)
export async function getRecommendationsByGenre(
  genre: string,
  accessToken: string,
  limit = 20
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    seed_genres: genre,
    target_energy: '0.8',
    target_danceability: '0.8',
    min_energy: '0.5',
    limit: limit.toString(),
  });
  const url = `${SPOTIFY_BASE}/recommendations?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Genre recommendations failed');
  const data = await res.json();
  return data.tracks;
}

// Fetch audio features for multiple tracks
export async function getAudioFeatures(trackIds: string[], accessToken: string): Promise<AudioFeatures[]> {
  if (!trackIds.length) return [];
  const url = `${SPOTIFY_BASE}/audio-features?ids=${trackIds.join(',')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.audio_features || []).filter(Boolean);
}

// Merge audio features into tracks
export function mergeAudioFeatures(tracks: SpotifyTrack[], features: AudioFeatures[]): SpotifyTrack[] {
  const featureMap = new Map(features.map((f) => [f.id, f]));
  return tracks.map((track) => {
    const f = featureMap.get(track.id);
    if (!f) return track;
    return { ...track, tempo: f.tempo, energy: f.energy, danceability: f.danceability, key: f.key, mode: f.mode };
  });
}

// Get current user's Spotify profile
export async function getCurrentUser(accessToken: string): Promise<{ id: string; display_name: string }> {
  const res = await fetch(`${SPOTIFY_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get user');
  return res.json();
}

// Create a playlist and add tracks to it
export async function createPlaylistAndAddTracks(
  userId: string,
  name: string,
  trackUris: string[],
  accessToken: string,
  description = 'Created by DJ Set Architect'
): Promise<{ id: string; external_urls: { spotify: string } }> {
  // Create playlist
  const createRes = await fetch(`${SPOTIFY_BASE}/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!createRes.ok) throw new Error('Failed to create playlist');
  const playlist = await createRes.json();

  // Add tracks
  await fetch(`${SPOTIFY_BASE}/playlists/${playlist.id}/tracks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: trackUris }),
  });

  return playlist;
}

// Map vibe strings to Spotify genre seeds
export function vibeToGenre(vibe: string): string {
  const lower = vibe.toLowerCase();
  if (lower.includes('house')) return 'house';
  if (lower.includes('techno')) return 'techno';
  if (lower.includes('drum') || lower.includes('dnb') || lower.includes('bass')) return 'drum-and-bass';
  if (lower.includes('hip') || lower.includes('hop') || lower.includes('rap')) return 'hip-hop';
  if (lower.includes('r&b') || lower.includes('rnb') || lower.includes('soul')) return 'r-n-b';
  if (lower.includes('afro')) return 'afrobeats';
  if (lower.includes('latin') || lower.includes('reggaeton')) return 'latin';
  if (lower.includes('disco') || lower.includes('funk')) return 'disco';
  if (lower.includes('jazz')) return 'jazz';
  if (lower.includes('trance')) return 'trance';
  if (lower.includes('ambient') || lower.includes('chill')) return 'ambient';
  if (lower.includes('pop')) return 'pop';
  if (lower.includes('rock')) return 'rock';
  if (lower.includes('indie')) return 'indie';
  if (lower.includes('electronic') || lower.includes('edm')) return 'electronic';
  // default
  return 'dance';
}

// Detect if input looks like a BPM number
export function isBPMQuery(input: string): boolean {
  const trimmed = input.trim();
  return /^\d{2,3}(\s*bpm)?$/i.test(trimmed);
}

// Parse BPM from input
export function parseBPM(input: string): number {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
}
