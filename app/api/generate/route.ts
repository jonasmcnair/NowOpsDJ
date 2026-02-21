import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

async function searchTracks(query: string, accessToken: string, limit = 20) {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.tracks.items;
}

async function getAudioFeatures(trackIds: string[], accessToken: string) {
  if (!trackIds.length) return [];
  const res = await fetch(`${SPOTIFY_BASE}/audio-features?ids=${trackIds.join(',')}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.audio_features || []).filter(Boolean);
}

const VIBE_QUERIES: Record<string, string[]> = {
  house: ['house music 2024', 'deep house', 'tech house'],
  techno: ['techno 2024', 'industrial techno', 'minimal techno'],
  afrobeats: ['afrobeats 2024', 'afro pop', 'afro fusion'],
  'hip-hop': ['hip hop 2024', 'rap 2024', 'trap music'],
  disco: ['disco classics', 'nu disco', 'funk disco'],
  dance: ['dance music 2024', 'edm 2024', 'dance pop'],
  electronic: ['electronic music 2024', 'synth pop', 'electro'],
  latin: ['reggaeton 2024', 'latin pop', 'latin dance'],
  trance: ['trance music', 'progressive trance', 'uplifting trance'],
  ambient: ['ambient music', 'chillout', 'downtempo'],
};

function vibeToQueries(input: string): string[] {
  const lower = input.toLowerCase();
  for (const [key, queries] of Object.entries(VIBE_QUERIES)) {
    if (lower.includes(key)) return queries;
  }
  return [input, `${input} mix`, `best ${input}`];
}

function isBPMQuery(input: string): boolean {
  return /^\d{2,3}(\s*bpm)?$/i.test(input.trim());
}

function parseBPM(input: string): number {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
}

export async function POST(request: NextRequest) {
  try {
    const { query, accessToken } = await request.json();
    if (!query || !accessToken) {
      return NextResponse.json({ error: 'Missing query or accessToken' }, { status: 400 });
    }

    let allTracks: any[] = [];

    if (isBPMQuery(query)) {
      // BPM-based: search dance/electronic and filter by tempo
      const bpm = parseBPM(query);
      const searches = await Promise.all([
        searchTracks('dance music', accessToken, 50),
        searchTracks('electronic music', accessToken, 50),
        searchTracks('house music', accessToken, 50),
      ]);
      allTracks = searches.flat();
    } else {
      // Song or vibe: search multiple queries
      const queries = vibeToQueries(query);
      const searches = await Promise.all([
        searchTracks(query, accessToken, 50),
        ...queries.slice(0, 2).map(q => searchTracks(q, accessToken, 30)),
      ]);
      allTracks = searches.flat();
    }

    // Deduplicate
    const seen = new Set<string>();
    allTracks = allTracks.filter(t => {
      if (!t?.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // Get audio features
    const ids = allTracks.map((t: any) => t.id).slice(0, 100);
    const features = await getAudioFeatures(ids, accessToken);
    const featureMap = new Map<string, any>(features.map((f: any) => [f.id, f]));

    // Merge features
    let enriched = allTracks.map((t: any) => ({
      ...t,
      tempo: featureMap.get(t.id)?.tempo,
      energy: featureMap.get(t.id)?.energy,
      danceability: featureMap.get(t.id)?.danceability,
      key: featureMap.get(t.id)?.key,
      mode: featureMap.get(t.id)?.mode,
    }));

    // Filter DJ friendly
    enriched = enriched.filter((t: any) =>
      t.energy === undefined || (t.energy >= 0.4 && t.danceability >= 0.4)
    );

    // BPM filter if needed
    if (isBPMQuery(query)) {
      const bpm = parseBPM(query);
      enriched = enriched.filter((t: any) => {
        if (!t.tempo) return false;
        return [t.tempo, t.tempo * 2, t.tempo / 2].some(c => Math.abs(c - bpm) <= 15);
      });
    }

    // Split popular vs hidden gems
    const popular = enriched.filter((t: any) => t.popularity >= 40)
      .sort((a: any, b: any) => b.popularity - a.popularity);
    const gems = enriched.filter((t: any) => t.popularity < 40)
      .sort(() => Math.random() - 0.5);

    let combined = [...popular.slice(0, 14), ...gems.slice(0, 6)];

    // Pad if needed
    if (combined.length < 20) {
      const usedIds = new Set(combined.map((t: any) => t.id));
      const remaining = enriched.filter((t: any) => !usedIds.has(t.id));
      combined = [...combined, ...remaining].slice(0, 20);
    }

    combined = combined.slice(0, 20);

    // Tag gems and sort by BPM
    const finalTracks = combined
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
