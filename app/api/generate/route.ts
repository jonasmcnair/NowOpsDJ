import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

function camelotMatch(sk: number, sm: number, tk: number, tm: number): 'perfect' | 'compatible' | 'none' {
  const s = getCamelotKey(sk, sm);
  const t = getCamelotKey(tk, tm);
  if (s === t) return 'perfect';
  const num = parseInt(s);
  const letter = s.slice(-1);
  const opp = letter === 'A' ? 'B' : 'A';
  const prev = num === 1 ? 12 : num - 1;
  const next = num === 12 ? 1 : num + 1;
  const compatible = [s, `${prev}${letter}`, `${next}${letter}`, `${num}${opp}`];
  return compatible.includes(t) ? 'compatible' : 'none';
}

async function apiFetch(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

async function searchTracks(query: string, accessToken: string, limit = 10) {
  const data = await apiFetch(
    `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    accessToken
  );
  return data?.tracks?.items || [];
}

async function getAudioFeatures(ids: string[], accessToken: string) {
  if (!ids.length) return [];
  const data = await apiFetch(
    `${SPOTIFY_BASE}/audio-features?ids=${ids.slice(0, 100).join(',')}`,
    accessToken
  );
  return (data?.audio_features || []).filter(Boolean);
}

async function getRelatedArtists(artistId: string, accessToken: string) {
  const data = await apiFetch(`${SPOTIFY_BASE}/artists/${artistId}/related-artists`, accessToken);
  return data?.artists || [];
}

async function getArtistTopTracks(artistId: string, accessToken: string) {
  const data = await apiFetch(`${SPOTIFY_BASE}/artists/${artistId}/top-tracks?market=US`, accessToken);
  return data?.tracks || [];
}

async function getArtistInfo(artistId: string, accessToken: string) {
  return apiFetch(`${SPOTIFY_BASE}/artists/${artistId}`, accessToken);
}

function isBPMQuery(input: string) {
  return /^\d{2,3}(\s*bpm)?$/i.test(input.trim());
}

function parseBPM(input: string) {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
}

function dedup(tracks: any[]) {
  const ids = new Set<string>();
  const names = new Set<string>();
  return tracks.filter((t: any) => {
    if (!t?.id || !t?.artists?.length) return false;
    if (ids.has(t.id)) return false;
    const key = `${t.name?.toLowerCase()}__${t.artists[0]?.name?.toLowerCase()}`;
    if (names.has(key)) return false;
    ids.add(t.id);
    names.add(key);
    return true;
  });
}

function scoreBadge(track: any, seed: any): { score: number; badge: string } {
  let score = 0;
  if (seed.key !== undefined && track.key !== undefined) {
    const km = camelotMatch(seed.key, seed.mode, track.key, track.mode);
    score += km === 'perfect' ? 40 : km === 'compatible' ? 20 : 0;
  }
  if (seed.tempo && track.tempo) {
    const diff = Math.min(
      Math.abs(seed.tempo - track.tempo) / seed.tempo,
      Math.abs(seed.tempo - track.tempo * 2) / seed.tempo,
      Math.abs(seed.tempo - track.tempo / 2) / seed.tempo
    );
    score += diff <= 0.05 ? 30 : diff <= 0.1 ? 15 : 0;
  }
  if (seed.energy !== undefined && track.energy !== undefined) {
    score += Math.abs(seed.energy - track.energy) <= 0.25 ? 20 : 0;
  }
  if ((track.danceability ?? 0) >= 0.7 && (track.popularity ?? 0) >= 70) score += 10;

  const badge =
    score >= 70 ? 'Perfect Mashup' :
    (track.danceability >= 0.7 && track.popularity >= 70) ? 'Floor Filler' :
    (track.popularity < 40 && track.danceability >= 0.6) ? 'Hidden Gem' :
    score >= 30 ? 'Good Match' : 'Discovered';

  return { score, badge };
}

const VIBE_MAP: Record<string, string[]> = {
  bbq: ['hip hop bbq', 'cookout classics', 'summer hip hop', 'old school hip hop party'],
  cookout: ['cookout classics', 'bbq hip hop', 'summer r&b', 'feel good hip hop'],
  house: ['deep house', 'tech house', 'house classics', 'house party'],
  techno: ['techno', 'industrial techno', 'techno classics'],
  afrobeats: ['afrobeats', 'afro pop', 'afrobeats party'],
  'hip hop': ['hip hop classics', 'hip hop hits', 'rap hits', 'old school hip hop'],
  rap: ['rap hits', 'hip hop classics', 'trap hits'],
  rnb: ['r&b hits', 'r&b classics', 'neo soul'],
  disco: ['disco classics', 'nu disco', 'funk hits'],
  latin: ['reggaeton hits', 'latin pop', 'latin party'],
  trance: ['trance classics', 'progressive trance', 'uplifting trance'],
  ambient: ['ambient', 'chillout', 'downtempo'],
  funk: ['funk classics', 'funk hits', 'disco funk'],
};

function vibeSearchTerms(input: string): string[] {
  const lower = input.toLowerCase();
  for (const [key, terms] of Object.entries(VIBE_MAP)) {
    if (lower.includes(key)) return terms;
  }
  return [input, `${input} hits`, `${input} classics`, `best ${input}`];
}

export async function POST(request: NextRequest) {
  try {
    const { query, accessToken } = await request.json();
    if (!query || !accessToken) {
      return NextResponse.json({ error: 'Missing query or accessToken' }, { status: 400 });
    }

    let allTracks: any[] = [];
    let seedFeatures: any = {};

    if (isBPMQuery(query)) {
      // ── BPM MODE ─────────────────────────────────────────────────────────────
      const bpm = parseBPM(query);
      seedFeatures = { tempo: bpm };
      const searches = await Promise.all([
        searchTracks('dance hits', accessToken, 10),
        searchTracks('electronic dance music', accessToken, 10),
        searchTracks('house music hits', accessToken, 10),
        searchTracks('club music', accessToken, 10),
      ]);
      allTracks = dedup(searches.flat());

    } else {
      // ── Try to find a specific song first ────────────────────────────────────
      const seedResults = await searchTracks(query, accessToken, 5);
      const seedTrack = seedResults[0];
      const isSong = seedTrack &&
        query.toLowerCase().split(' ').some((w: string) =>
          w.length > 2 && seedTrack.name.toLowerCase().includes(w)
        );

      if (isSong && seedTrack) {
        // ── SONG MODE ───────────────────────────────────────────────────────────
        const artistId = seedTrack.artists[0].id;

        // Get seed audio features
        const [seedAF, artistInfo, relatedArtists] = await Promise.all([
          getAudioFeatures([seedTrack.id], accessToken),
          getArtistInfo(artistId, accessToken),
          getRelatedArtists(artistId, accessToken),
        ]);

        if (seedAF[0]) {
          seedFeatures = {
            tempo: seedAF[0].tempo,
            energy: seedAF[0].energy,
            key: seedAF[0].key,
            mode: seedAF[0].mode,
          };
        }

        const genres: string[] = artistInfo?.genres || [];

        // Get top tracks from top 8 related artists
        const top8Related = relatedArtists.slice(0, 8);
        const relatedTrackSets = await Promise.all(
          top8Related.map((a: any) => getArtistTopTracks(a.id, accessToken))
        );

        // Get same artist's top tracks
        const sameArtistTracks = await getArtistTopTracks(artistId, accessToken);

        // Search by genres
        const genreSearches = await Promise.all([
          genres[0] ? searchTracks(genres[0], accessToken, 10) : Promise.resolve([]),
          genres[1] ? searchTracks(genres[1], accessToken, 10) : Promise.resolve([]),
          genres[0] ? searchTracks(`${genres[0]} hits`, accessToken, 10) : Promise.resolve([]),
          // Also search artist name broadly for more variety
          searchTracks(seedTrack.artists[0].name, accessToken, 10),
        ]);

        allTracks = dedup([
          seedTrack,
          ...relatedTrackSets.flat(),
          ...sameArtistTracks,
          ...genreSearches.flat(),
        ]);

      } else {
        // ── VIBE MODE ───────────────────────────────────────────────────────────
        const terms = vibeSearchTerms(query);
        const searches = await Promise.all(
          terms.map(t => searchTracks(t, accessToken, 10))
        );
        allTracks = dedup(searches.flat());
      }
    }

    // ── Enrich with audio features ────────────────────────────────────────────
    const ids = allTracks.map((t: any) => t.id).slice(0, 100);
    const features = await getAudioFeatures(ids, accessToken);
    const fmap = new Map<string, any>(features.map((f: any) => [f.id, f]));

    let enriched: any[] = allTracks.map((t: any) => {
      const f = fmap.get(t.id);
      return { ...t, tempo: f?.tempo, energy: f?.energy, danceability: f?.danceability, key: f?.key, mode: f?.mode };
    });

    // ── Only remove tracks with no id/artist — no energy filter ──────────────
    enriched = enriched.filter((t: any) => t?.id && t?.artists?.length > 0);

    // ── BPM filter only for explicit BPM queries ──────────────────────────────
    if (isBPMQuery(query) && seedFeatures.tempo) {
      const bpm = seedFeatures.tempo;
      const filtered = enriched.filter((t: any) => {
        if (!t.tempo) return true;
        return Math.min(
          Math.abs(t.tempo - bpm),
          Math.abs(t.tempo * 2 - bpm),
          Math.abs(t.tempo / 2 - bpm)
        ) <= 20;
      });
      if (filtered.length >= 10) enriched = filtered;
    }

    // ── Score and sort ────────────────────────────────────────────────────────
    enriched = enriched
      .map((t: any) => { const { score, badge } = scoreBadge(t, seedFeatures); return { ...t, matchScore: score, badge }; })
      .sort((a: any, b: any) => b.matchScore - a.matchScore);

    // ── 70/30 split ───────────────────────────────────────────────────────────
    const popular = enriched.filter((t: any) => (t.popularity ?? 0) >= 40);
    const gems = enriched.filter((t: any) => (t.popularity ?? 0) < 40);
    let pool = [...popular.slice(0, 14), ...gems.slice(0, 6)];
    if (pool.length < 20) {
      const used = new Set(pool.map((t: any) => t.id));
      pool = [...pool, ...enriched.filter((t: any) => !used.has(t.id))].slice(0, 20);
    }

    // ── Artist diversity — progressively relax ────────────────────────────────
    let final: any[] = [];
    for (const max of [1, 2, 3, 99]) {
      const artistCount = new Map<string, number>();
      final = [];
      for (const t of [...pool, ...enriched]) {
        if (final.length >= 20) break;
        if (final.find((x: any) => x.id === t.id)) continue;
        const a = t.artists[0]?.name;
        const n = artistCount.get(a) || 0;
        if (n < max) { final.push(t); artistCount.set(a, n + 1); }
      }
      if (final.length >= 15) break;
    }

    // ── Sort by BPM for mix flow ──────────────────────────────────────────────
    final = final
      .slice(0, 20)
      .map((t: any) => ({ ...t, isHiddenGem: (t.popularity ?? 0) < 40 }))
      .sort((a: any, b: any) => (a.tempo ?? 0) - (b.tempo ?? 0));

    return NextResponse.json({ tracks: final });

  } catch (e) {
    console.error('Generate error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
