import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

// ── Camelot Wheel ─────────────────────────────────────────────────────────────
const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

function getCompatibleCamelotKeys(key: number, mode: number): string[] {
  const current = getCamelotKey(key, mode);
  if (current === '?') return [];
  const num = parseInt(current);
  const letter = current.slice(-1);
  const opp = letter === 'A' ? 'B' : 'A';
  const prev = num === 1 ? 12 : num - 1;
  const next = num === 12 ? 1 : num + 1;
  return [current, `${prev}${letter}`, `${next}${letter}`, `${num}${opp}`];
}

function camelotMatch(sk: number, sm: number, tk: number, tm: number): 'perfect' | 'compatible' | 'none' {
  const s = getCamelotKey(sk, sm);
  const t = getCamelotKey(tk, tm);
  if (s === t) return 'perfect';
  if (getCompatibleCamelotKeys(sk, sm).includes(t)) return 'compatible';
  return 'none';
}

// ── API Helpers ───────────────────────────────────────────────────────────────
async function searchTracks(query: string, accessToken: string, limit = 10) {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { const e = await res.text(); throw new Error(`Search failed: ${res.status} ${e}`); }
  const data = await res.json();
  return data.tracks?.items || [];
}

async function searchPlaylists(query: string, accessToken: string, limit = 10) {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.playlists?.items || [];
}

async function getPlaylistTracks(playlistId: string, accessToken: string, limit = 30) {
  const url = `${SPOTIFY_BASE}/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(id,name,artists,album,external_urls,preview_url,popularity,uri))`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || [])
    .map((item: any) => item.track)
    .filter((t: any) => t?.id);
}

async function getAudioFeatures(trackIds: string[], accessToken: string) {
  if (!trackIds.length) return [];
  const res = await fetch(`${SPOTIFY_BASE}/audio-features?ids=${trackIds.slice(0, 100).join(',')}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.audio_features || []).filter(Boolean);
}

async function getArtist(artistId: string, accessToken: string) {
  const res = await fetch(`${SPOTIFY_BASE}/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getRelatedArtists(artistId: string, accessToken: string) {
  const res = await fetch(`${SPOTIFY_BASE}/artists/${artistId}/related-artists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists || [];
}

async function getArtistTopTracks(artistId: string, accessToken: string) {
  const res = await fetch(`${SPOTIFY_BASE}/artists/${artistId}/top-tracks?market=US`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.tracks || [];
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function isBPMQuery(input: string): boolean {
  return /^\d{2,3}(\s*bpm)?$/i.test(input.trim());
}

function parseBPM(input: string): number {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
}

function dedup(tracks: any[]): any[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  return tracks.filter((t: any) => {
    if (!t?.id || ids.has(t.id)) return false;
    const nameKey = `${t.name?.toLowerCase()}__${t.artists?.[0]?.name?.toLowerCase()}`;
    if (names.has(nameKey)) return false;
    ids.add(t.id);
    names.add(nameKey);
    return true;
  });
}

// DJ-style playlist keywords — used to filter playlists that are likely DJ sets
const DJ_KEYWORDS = ['mix', 'dj', 'set', 'club', 'party', 'dance', 'session', 'playlist', 'vibes', 'night', 'bbq', 'cookout', 'summer', 'festival', 'warm up', 'essential'];

function isDJPlaylist(name: string): boolean {
  const lower = name.toLowerCase();
  return DJ_KEYWORDS.some(k => lower.includes(k));
}

function calculateMatchScore(
  track: any,
  seed: { tempo?: number; energy?: number; key?: number; mode?: number }
): { score: number; badge: string } {
  let score = 0;

  if (seed.key !== undefined && seed.mode !== undefined &&
      track.key !== undefined && track.mode !== undefined) {
    const km = camelotMatch(seed.key, seed.mode, track.key, track.mode);
    if (km === 'perfect') score += 40;
    else if (km === 'compatible') score += 20;
  }

  if (seed.tempo && track.tempo) {
    const pct = Math.abs(seed.tempo - track.tempo) / seed.tempo;
    const half = Math.abs(seed.tempo - track.tempo * 2) / seed.tempo;
    const dbl = Math.abs(seed.tempo - track.tempo / 2) / seed.tempo;
    if (Math.min(pct, half, dbl) <= 0.03) score += 30;
    else if (Math.min(pct, half, dbl) <= 0.08) score += 15;
  }

  if (seed.energy !== undefined && track.energy !== undefined) {
    if (Math.abs(seed.energy - track.energy) <= 0.2) score += 20;
  }

  if (track.danceability >= 0.7 && track.popularity >= 70) score += 10;

  const badge =
    score >= 70 ? 'Perfect Mashup' :
    (track.danceability >= 0.7 && track.popularity >= 70) ? 'Floor Filler' :
    (track.popularity < 40 && track.danceability >= 0.6) ? 'Hidden Gem' :
    score >= 30 ? 'Good Match' : 'Discovered';

  return { score, badge };
}

// ── Vibe → playlist search queries ───────────────────────────────────────────
function vibeToPlaylistQueries(input: string): string[] {
  const lower = input.toLowerCase();
  // Return 3 playlist search queries that will find real DJ curated playlists
  const base = [
    `${input} playlist`,
    `${input} mix`,
    `${input} party`,
  ];
  if (lower.includes('hip hop') || lower.includes('hip-hop') || lower.includes('rap')) {
    return [`${input} playlist`, 'hip hop party mix', 'hip hop bbq cookout playlist'];
  }
  if (lower.includes('bbq') || lower.includes('cookout') || lower.includes('backyard')) {
    return [`${input}`, 'backyard bbq party playlist', 'cookout hip hop r&b mix'];
  }
  if (lower.includes('house')) return [`${input}`, 'deep house dj mix', 'house music club session'];
  if (lower.includes('techno')) return [`${input}`, 'techno dj set', 'techno club night mix'];
  if (lower.includes('r&b') || lower.includes('rnb')) return [`${input}`, 'r&b vibes playlist', 'r&b slow jams mix'];
  if (lower.includes('afro')) return [`${input}`, 'afrobeats party mix', 'afrobeats dj set'];
  if (lower.includes('latin') || lower.includes('reggaeton')) return [`${input}`, 'reggaeton mix', 'latin party playlist'];
  if (lower.includes('disco') || lower.includes('funk')) return [`${input}`, 'disco funk party', 'funky dance mix'];
  return base;
}

// ── Main Route ────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { query, accessToken } = await request.json();
    if (!query || !accessToken) {
      return NextResponse.json({ error: 'Missing query or accessToken' }, { status: 400 });
    }

    let allTracks: any[] = [];
    let seedFeatures: { tempo?: number; energy?: number; key?: number; mode?: number } = {};

    if (isBPMQuery(query)) {
      // ── BPM mode ────────────────────────────────────────────────────────────
      const bpm = parseBPM(query);
      seedFeatures = { tempo: bpm };

      // Search playlists for BPM-specific DJ sets
      const playlists = await searchPlaylists(`${bpm} bpm dj mix`, accessToken, 8);
      const djPlaylists = playlists.filter((p: any) => p?.id);

      const playlistTrackSets = await Promise.all(
        djPlaylists.slice(0, 4).map((p: any) => getPlaylistTracks(p.id, accessToken, 20))
      );
      const fallback = await Promise.all([
        searchTracks('dance music', accessToken),
        searchTracks('electronic music', accessToken),
      ]);

      allTracks = dedup([...playlistTrackSets.flat(), ...fallback.flat()]);

    } else {
      // ── Song or vibe mode ────────────────────────────────────────────────────
      const songResults = await searchTracks(query, accessToken, 5);
      const seedTrack = songResults[0];
      const isVibeQuery = !seedTrack || seedTrack.name.toLowerCase() !== query.toLowerCase().trim();

      if (seedTrack && !isVibeQuery) {
        // ── SONG MODE: find playlists that contain this exact song ─────────────
        const seedArtistId = seedTrack.artists[0].id;
        const seedArtistName = seedTrack.artists[0].name;

        // Get seed audio features
        const seedAF = await getAudioFeatures([seedTrack.id], accessToken);
        if (seedAF[0]) {
          seedFeatures = {
            tempo: seedAF[0].tempo,
            energy: seedAF[0].energy,
            key: seedAF[0].key,
            mode: seedAF[0].mode,
          };
        }

        // Search for DJ playlists featuring this song/artist
        const [playlistSearch1, playlistSearch2, playlistSearch3] = await Promise.all([
          searchPlaylists(`${seedTrack.name} ${seedArtistName}`, accessToken, 10),
          searchPlaylists(`${seedArtistName} mix`, accessToken, 10),
          searchPlaylists(`${seedTrack.name} dj mix`, accessToken, 8),
        ]);

        // Prioritise playlists that look like DJ sets, sorted by follower count proxy (order in results)
        const allPlaylists = [...playlistSearch1, ...playlistSearch2, ...playlistSearch3]
          .filter((p: any) => p?.id)
          .filter((p: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === p.id) === i); // dedup playlists

        const djPlaylists = allPlaylists.filter((p: any) => isDJPlaylist(p.name));
        const otherPlaylists = allPlaylists.filter((p: any) => !isDJPlaylist(p.name));
        const prioritised = [...djPlaylists, ...otherPlaylists].slice(0, 6);

        // Pull tracks from those playlists
        const playlistTrackSets = await Promise.all(
          prioritised.map((p: any) => getPlaylistTracks(p.id, accessToken, 25))
        );

        // Also get related artist tracks as backup
        const seedArtist = await getArtist(seedArtistId, accessToken);
        const relatedArtists = await getRelatedArtists(seedArtistId, accessToken);
        const top4Related = relatedArtists.slice(0, 4);
        const relatedTopTracks = await Promise.all(
          top4Related.map((a: any) => getArtistTopTracks(a.id, accessToken))
        );

        // Genre search backup
        const genres: string[] = seedArtist?.genres || [];
        const genreTracks = genres[0]
          ? await searchTracks(genres[0], accessToken)
          : [];

        allTracks = dedup([
          seedTrack,
          ...playlistTrackSets.flat(),
          ...relatedTopTracks.flat(),
          ...genreTracks,
        ]);

      } else {
        // ── VIBE MODE: search popular playlists matching the vibe ─────────────
        const vibeQueries = vibeToPlaylistQueries(query);

        const [pl1, pl2, pl3] = await Promise.all(
          vibeQueries.map(q => searchPlaylists(q, accessToken, 10))
        );

        const allPlaylists = [...pl1, ...pl2, ...pl3]
          .filter((p: any) => p?.id)
          .filter((p: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === p.id) === i);

        // Sort: DJ playlists first, then by position (Spotify returns by relevance/popularity)
        const djPlaylists = allPlaylists.filter((p: any) => isDJPlaylist(p.name));
        const otherPlaylists = allPlaylists.filter((p: any) => !isDJPlaylist(p.name));
        const prioritised = [...djPlaylists, ...otherPlaylists].slice(0, 6);

        const playlistTrackSets = await Promise.all(
          prioritised.map((p: any) => getPlaylistTracks(p.id, accessToken, 25))
        );

        // Fallback track search
        const fallbackTracks = await searchTracks(query, accessToken);

        allTracks = dedup([...playlistTrackSets.flat(), ...fallbackTracks]);
      }
    }

    // ── Enrich with audio features ────────────────────────────────────────────
    const ids = allTracks.map((t: any) => t.id).slice(0, 100);
    const features = await getAudioFeatures(ids, accessToken);
    const featureMap = new Map<string, any>(features.map((f: any) => [f.id, f]));

    let enriched: any[] = allTracks.map((t: any) => {
      const f = featureMap.get(t.id);
      return { ...t, tempo: f?.tempo, energy: f?.energy, danceability: f?.danceability, key: f?.key, mode: f?.mode };
    });

    // ── Filter DJ friendly ────────────────────────────────────────────────────
    enriched = enriched.filter((t: any) =>
      t.energy === undefined || (t.energy >= 0.4 && t.danceability >= 0.4)
    );

    // ── Energy filter within 25% of seed ─────────────────────────────────────
    if (seedFeatures.energy !== undefined) {
      const e = seedFeatures.energy;
      const filtered = enriched.filter((t: any) =>
        t.energy === undefined || Math.abs(t.energy - e) <= 0.25
      );
      if (filtered.length >= 15) enriched = filtered;
    }

    // ── BPM filter ────────────────────────────────────────────────────────────
    if (isBPMQuery(query) && seedFeatures.tempo) {
      const bpm = seedFeatures.tempo;
      enriched = enriched.filter((t: any) => {
        if (!t.tempo) return true; // keep if no tempo data
        return [t.tempo, t.tempo * 2, t.tempo / 2].some((c: number) => Math.abs(c - bpm) <= 15);
      });
    }

    // ── Score every track ─────────────────────────────────────────────────────
    enriched = enriched.map((t: any) => {
      const { score, badge } = calculateMatchScore(t, seedFeatures);
      return { ...t, matchScore: score, badge };
    });

    // ── Sort by score ─────────────────────────────────────────────────────────
    enriched.sort((a: any, b: any) => b.matchScore - a.matchScore);

    // ── 70/30 popular/gems ────────────────────────────────────────────────────
    const popular = enriched.filter((t: any) => t.popularity >= 40);
    const gems = enriched.filter((t: any) => t.popularity < 40);
    let combined = [...popular.slice(0, 14), ...gems.slice(0, 6)];

    if (combined.length < 20) {
      const usedIds = new Set(combined.map((t: any) => t.id));
      combined = [...combined, ...enriched.filter((t: any) => !usedIds.has(t.id))].slice(0, 20);
    }

// ── Max 1 track per artist, but relax if not enough tracks ───────────────
    const artistSeen = new Map<string, number>();
    const maxPerArtist = enriched.length < 30 ? 3 : combined.length < 15 ? 2 : 1;
    let diversified = combined.filter((t: any) => {
      const a = t.artists[0]?.name;
      const n = artistSeen.get(a) || 0;
      if (n >= maxPerArtist) return false;
      artistSeen.set(a, n + 1);
      return true;
    });

    // Pad back to 20, relaxing artist constraint each pass if needed
    for (const limit of [2, 3, 99]) {
      if (diversified.length >= 20) break;
      const usedIds = new Set(diversified.map((t: any) => t.id));
      const artistCount2 = new Map<string, number>();
      diversified.forEach((t: any) => {
        const a = t.artists[0]?.name;
        artistCount2.set(a, (artistCount2.get(a) || 0) + 1);
      });
      const extras = enriched.filter((t: any) => {
        if (usedIds.has(t.id)) return false;
        const a = t.artists[0]?.name;
        return (artistCount2.get(a) || 0) < limit;
      });
      diversified = [...diversified, ...extras].slice(0, 20);
    }

    // ── Final sort by BPM for natural mix flow ────────────────────────────────
    const finalTracks = diversified
      .slice(0, 20)
      .map((t: any) => ({ ...t, isHiddenGem: t.popularity < 40 }))
      .sort((a: any, b: any) => (a.tempo ?? 0) - (b.tempo ?? 0));

    return NextResponse.json({ tracks: finalTracks });

  } catch (e) {
    console.error('Generate error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
