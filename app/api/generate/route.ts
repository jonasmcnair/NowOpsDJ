import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

// ── Camelot Wheel ────────────────────────────────────────────────────────────
const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

// Compatible Camelot keys: same, +/-1 number (same letter), or same number opposite letter
function getCompatibleCamelotKeys(key: number, mode: number): string[] {
  const current = getCamelotKey(key, mode);
  if (current === '?') return [];
  const num = parseInt(current);
  const letter = current.slice(-1);
  const oppositeLetter = letter === 'A' ? 'B' : 'A';
  const prev = num === 1 ? 12 : num - 1;
  const next = num === 12 ? 1 : num + 1;
  return [
    current,                        // Same key (perfect)
    `${prev}${letter}`,             // -1 (energy down)
    `${next}${letter}`,             // +1 (energy up)
    `${num}${oppositeLetter}`,      // Relative major/minor
  ];
}

function camelotMatch(
  seedKey: number, seedMode: number,
  trackKey: number, trackMode: number
): 'perfect' | 'compatible' | 'none' {
  const seedCamelot = getCamelotKey(seedKey, seedMode);
  const trackCamelot = getCamelotKey(trackKey, trackMode);
  if (seedCamelot === trackCamelot) return 'perfect';
  if (getCompatibleCamelotKeys(seedKey, seedMode).includes(trackCamelot)) return 'compatible';
  return 'none';
}

// ── Spotify API helpers ──────────────────────────────────────────────────────
async function searchTracks(query: string, accessToken: string, limit = 10) {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Search failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.tracks.items || [];
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

// ── Utility ──────────────────────────────────────────────────────────────────
function isBPMQuery(input: string): boolean {
  return /^\d{2,3}(\s*bpm)?$/i.test(input.trim());
}

function parseBPM(input: string): number {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
}

function dedup(tracks: any[]): any[] {
  const seen = new Set<string>();
  const nameSeen = new Set<string>();
  return tracks.filter((t: any) => {
    if (!t?.id || seen.has(t.id)) return false;
    const nameKey = `${t.name?.toLowerCase()}__${t.artists?.[0]?.name?.toLowerCase()}`;
    if (nameSeen.has(nameKey)) return false;
    seen.add(t.id);
    nameSeen.add(nameKey);
    return true;
  });
}

function bpmMatch(seedTempo: number, trackTempo: number): boolean {
  if (!seedTempo || !trackTempo) return false;
  const pct = Math.abs(seedTempo - trackTempo) / seedTempo;
  const halfTime = Math.abs(seedTempo - trackTempo * 2) / seedTempo;
  const doubleTime = Math.abs(seedTempo - trackTempo / 2) / seedTempo;
  return pct <= 0.03 || halfTime <= 0.03 || doubleTime <= 0.03;
}

// ── Match Score ───────────────────────────────────────────────────────────────
function calculateMatchScore(
  track: any,
  seed: { tempo?: number; energy?: number; key?: number; mode?: number }
): { score: number; badge: string } {
  let score = 0;
  const badges: string[] = [];

  // Key compatibility (40 pts)
  if (seed.key !== undefined && seed.mode !== undefined &&
      track.key !== undefined && track.mode !== undefined) {
    const keyMatch = camelotMatch(seed.key, seed.mode, track.key, track.mode);
    if (keyMatch === 'perfect') { score += 40; badges.push('Perfect Key'); }
    else if (keyMatch === 'compatible') { score += 20; badges.push('Compatible Key'); }
  }

  // BPM match (30 pts)
  if (seed.tempo && track.tempo) {
    if (bpmMatch(seed.tempo, track.tempo)) { score += 30; badges.push('BPM Match'); }
  }

  // Energy match within 20% (20 pts)
  if (seed.energy !== undefined && track.energy !== undefined) {
    if (Math.abs(seed.energy - track.energy) <= 0.2) { score += 20; badges.push('Energy Match'); }
  }

  // Floor filler bonus (10 pts)
  if (track.danceability >= 0.7 && track.popularity >= 70) {
    score += 10; badges.push('Floor Filler');
  }

  // Hidden gem bonus
  if (track.popularity < 40 && track.danceability >= 0.6) {
    badges.push('Hidden Gem');
  }

  // Perfect mashup if key + BPM both match
  const badge = badges.includes('Perfect Key') && badges.includes('BPM Match')
    ? 'Perfect Mashup'
    : badges.includes('Floor Filler')
    ? 'Floor Filler'
    : badges.includes('Hidden Gem')
    ? 'Hidden Gem'
    : badges.length > 0
    ? 'Good Match'
    : 'Discovered';

  return { score, badge };
}

const VIBE_QUERIES: Record<string, string[]> = {
  house: ['house music', 'deep house', 'tech house'],
  techno: ['techno', 'industrial techno', 'minimal techno'],
  afrobeats: ['afrobeats', 'afro pop', 'afro fusion'],
  hip: ['hip hop', 'rap', 'trap music'],
  disco: ['disco', 'nu disco', 'funk disco'],
  dance: ['dance music', 'edm', 'dance pop'],
  electronic: ['electronic music', 'synth pop', 'electro'],
  latin: ['reggaeton', 'latin pop', 'latin dance'],
  trance: ['trance music', 'progressive trance', 'uplifting trance'],
  ambient: ['ambient music', 'chillout', 'downtempo'],
  funk: ['funk music', 'nu funk', 'disco funk'],
  jazz: ['jazz', 'nu jazz', 'jazz fusion'],
};

function vibeToQueries(input: string): string[] {
  const lower = input.toLowerCase();
  for (const [key, queries] of Object.entries(VIBE_QUERIES)) {
    if (lower.includes(key)) return queries;
  }
  return [input, `${input} mix`, `best ${input} tracks`];
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
      const bpm = parseBPM(query);
      seedFeatures = { tempo: bpm };
      const searches = await Promise.all([
        searchTracks('dance music', accessToken),
        searchTracks('electronic music', accessToken),
        searchTracks('house music', accessToken),
      ]);
      allTracks = dedup(searches.flat());

    } else {
      // Step 1: Find seed track
      const seedResults = await searchTracks(query, accessToken, 10);
      const seedTrack = seedResults[0];

      if (seedTrack) {
        // Step 2: Get seed track audio features
        const seedAudioFeatures = await getAudioFeatures([seedTrack.id], accessToken);
        if (seedAudioFeatures[0]) {
          const sf = seedAudioFeatures[0];
          seedFeatures = {
            tempo: sf.tempo,
            energy: sf.energy,
            key: sf.key,
            mode: sf.mode,
          };
        }

        const seedArtistId = seedTrack.artists[0].id;
        const seedArtist = await getArtist(seedArtistId, accessToken);
        const genres: string[] = seedArtist?.genres || [];

        // Step 3: Multi-pass fetching
        const relatedArtists = await getRelatedArtists(seedArtistId, accessToken);
        const top6Related = relatedArtists.slice(0, 6);

        const [
          relatedTrackSets,
          sameArtistTracks,
          anchorTracks,
          boundaryTracks,
        ] = await Promise.all([
          // Related artist top tracks (the core of the set)
          Promise.all(top6Related.map((a: any) => getArtistTopTracks(a.id, accessToken))),
          // Same artist tracks
          getArtistTopTracks(seedArtistId, accessToken),
          // Anchor: genre-based popular tracks
          genres[0] ? searchTracks(`genre:${genres[0]}`, accessToken) : searchTracks(query, accessToken),
          // Boundary pusher: deeper cuts from related genres
          genres[1] ? searchTracks(`${genres[1]} underground`, accessToken) : searchTracks(`${query} underground`, accessToken),
        ]);

        allTracks = dedup([
          seedTrack,
          ...relatedTrackSets.flat(),
          ...sameArtistTracks,
          ...anchorTracks,
          ...boundaryTracks,
          ...seedResults.slice(1),
        ]);

      } else {
        // Fallback: vibe search
        const queries = vibeToQueries(query);
        const searches = await Promise.all(queries.map(q => searchTracks(q, accessToken)));
        allTracks = dedup(searches.flat());
      }
    }

    // ── Enrich with audio features ──────────────────────────────────────────
    const ids = allTracks.map((t: any) => t.id).slice(0, 100);
    const features = await getAudioFeatures(ids, accessToken);
    const featureMap = new Map<string, any>(features.map((f: any) => [f.id, f]));

    let enriched: any[] = allTracks.map((t: any) => {
      const f = featureMap.get(t.id);
      return {
        ...t,
        tempo: f?.tempo,
        energy: f?.energy,
        danceability: f?.danceability,
        key: f?.key,
        mode: f?.mode,
      };
    });

    // ── Filter DJ friendly ──────────────────────────────────────────────────
    enriched = enriched.filter((t: any) =>
      t.energy === undefined || (t.energy >= 0.4 && t.danceability >= 0.4)
    );

    // ── Energy filter: within 20% of seed ──────────────────────────────────
    if (seedFeatures.energy !== undefined) {
      const seedEnergy = seedFeatures.energy;
      const energyFiltered = enriched.filter((t: any) =>
        t.energy === undefined || Math.abs(t.energy - seedEnergy) <= 0.2
      );
      if (energyFiltered.length >= 15) enriched = energyFiltered;
    }

    // ── BPM filter ──────────────────────────────────────────────────────────
    if (isBPMQuery(query) && seedFeatures.tempo) {
      const bpm = seedFeatures.tempo;
      enriched = enriched.filter((t: any) => {
        if (!t.tempo) return false;
        return [t.tempo, t.tempo * 2, t.tempo / 2].some((c: number) => Math.abs(c - bpm) <= 15);
      });
    }

    // ── Score every track ───────────────────────────────────────────────────
    enriched = enriched.map((t: any) => {
      const { score, badge } = calculateMatchScore(t, seedFeatures);
      return { ...t, matchScore: score, badge };
    });

    // ── Sort by match score ─────────────────────────────────────────────────
    enriched.sort((a: any, b: any) => b.matchScore - a.matchScore);

    // ── 70/30 popular/gems split ────────────────────────────────────────────
    const popular = enriched.filter((t: any) => t.popularity >= 40);
    const gems = enriched.filter((t: any) => t.popularity < 40);

    let combined = [...popular.slice(0, 14), ...gems.slice(0, 6)];

    if (combined.length < 20) {
      const usedIds = new Set(combined.map((t: any) => t.id));
      const remaining = enriched.filter((t: any) => !usedIds.has(t.id));
      combined = [...combined, ...remaining].slice(0, 20);
    }

    // ── Max 1 track per artist ──────────────────────────────────────────────
    const artistCount = new Map<string, number>();
    let diversified = combined.filter((t: any) => {
      const artist = t.artists[0].name;
      const count = artistCount.get(artist) || 0;
      if (count >= 1) return false;
      artistCount.set(artist, count + 1);
      return true;
    });

    // Pad back to 20
    if (diversified.length < 20) {
      const usedIds = new Set(diversified.map((t: any) => t.id));
      const usedArtists = new Set(diversified.map((t: any) => t.artists[0].name));
      const extras = enriched.filter((t: any) =>
        !usedIds.has(t.id) && !usedArtists.has(t.artists[0].name)
      );
      diversified = [...diversified, ...extras].slice(0, 20);
    }

    // ── Final sort by BPM for DJ flow ───────────────────────────────────────
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
