import { NextRequest, NextResponse } from 'next/server';

const SPOTIFY_BASE = 'https://api.spotify.com/v1';

async function searchTracks(query: string, accessToken: string, limit = 10) {
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Search failed: ${res.status} ${errText}`);
  }
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

function isBPMQuery(input: string): boolean {
  return /^\d{2,3}(\s*bpm)?$/i.test(input.trim());
}

function parseBPM(input: string): number {
  return parseInt(input.replace(/bpm/i, '').trim(), 10);
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

function dedup(tracks: any[]): any[] {
  const seen = new Set<string>();
  return tracks.filter((t: any) => {
    if (!t?.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export async function POST(request: NextRequest) {
  try {
    const { query, accessToken } = await request.json();
    if (!query || !accessToken) {
      return NextResponse.json({ error: 'Missing query or accessToken' }, { status: 400 });
    }

    let allTracks: any[] = [];

    if (isBPMQuery(query)) {
      // BPM mode: search dance genres and filter by tempo
      const searches = await Promise.all([
        searchTracks('dance music', accessToken),
        searchTracks('electronic music', accessToken),
        searchTracks('house music', accessToken),
      ]);
      allTracks = dedup(searches.flat());

    } else {
      // Step 1: Find the seed track
      const seedResults = await searchTracks(query, accessToken, 10);
      const seedTrack = seedResults[0];

      if (seedTrack) {
        const seedArtistId = seedTrack.artists[0].id;

        // Step 2: Get the seed artist's genres
        const seedArtist = await getArtist(seedArtistId, accessToken);
        const genres: string[] = seedArtist?.genres || [];
        const primaryGenre = genres[0] || '';
        const secondaryGenre = genres[1] || '';

        // Step 3: Get related artists (who DJs would play alongside this artist)
        const relatedArtists = await getRelatedArtists(seedArtistId, accessToken);
        const top5Related = relatedArtists.slice(0, 5);

        // Step 4: Get top tracks from related artists
        const relatedTrackSets = await Promise.all(
          top5Related.map((a: any) => getArtistTopTracks(a.id, accessToken))
        );
        const relatedTracks = relatedTrackSets.flat();

        // Step 5: Search by genre for more variety
        const genreSearches = await Promise.all([
          primaryGenre ? searchTracks(primaryGenre, accessToken) : Promise.resolve([]),
          secondaryGenre ? searchTracks(secondaryGenre, accessToken) : Promise.resolve([]),
          searchTracks(`${seedArtist?.name || query} similar artists`, accessToken),
        ]);

        // Step 6: Get more tracks from same artist
        const sameArtistTracks = await getArtistTopTracks(seedArtistId, accessToken);

      // Combine: seed track first, then related artists, then genre searches
        allTracks = dedup([
          seedTrack,
          ...relatedTracks,
          ...sameArtistTracks,
          ...genreSearches.flat(),
          ...seedResults.slice(1),
        ]);

        // Also deduplicate by track name + artist to catch re-releases and remasters
        const nameSeen = new Set<string>();
        allTracks = allTracks.filter((t: any) => {
          const key = `${t.name.toLowerCase()}__${t.artists[0].name.toLowerCase()}`;
          if (nameSeen.has(key)) return false;
          nameSeen.add(key);
          return true;
        });

      } else {
        // Fallback: vibe-based search
        const queries = vibeToQueries(query);
        const searches = await Promise.all(
          queries.map(q => searchTracks(q, accessToken))
        );
        allTracks = dedup(searches.flat());
      }
    }

    // Get audio features for all candidates
    const ids = allTracks.map((t: any) => t.id).slice(0, 100);
    const features = await getAudioFeatures(ids, accessToken);
    const featureMap = new Map<string, any>(features.map((f: any) => [f.id, f]));

    // Merge audio features
    let enriched: any[] = allTracks.map((t: any) => ({
      ...t,
      tempo: featureMap.get(t.id)?.tempo,
      energy: featureMap.get(t.id)?.energy,
      danceability: featureMap.get(t.id)?.danceability,
      key: featureMap.get(t.id)?.key,
      mode: featureMap.get(t.id)?.mode,
    }));

    // Filter DJ friendly (high energy + danceability)
    enriched = enriched.filter((t: any) =>
      t.energy === undefined || (t.energy >= 0.4 && t.danceability >= 0.4)
    );

    // BPM filter if needed
    if (isBPMQuery(query)) {
      const bpm = parseBPM(query);
      enriched = enriched.filter((t: any) => {
        if (!t.tempo) return false;
        return [t.tempo, t.tempo * 2, t.tempo / 2].some((c: number) => Math.abs(c - bpm) <= 15);
      });
    }

    // Split 70% popular / 30% hidden gems
    const popular = enriched
      .filter((t: any) => t.popularity >= 40)
      .sort((a: any, b: any) => b.popularity - a.popularity);
    const gems = enriched
      .filter((t: any) => t.popularity < 40)
      .sort(() => Math.random() - 0.5);

    let combined = [...popular.slice(0, 14), ...gems.slice(0, 6)];

    // Pad to 20 if needed
    if (combined.length < 20) {
      const usedIds = new Set(combined.map((t: any) => t.id));
      const remaining = enriched.filter((t: any) => !usedIds.has(t.id));
      combined = [...combined, ...remaining].slice(0, 20);
    }

    combined = combined.slice(0, 20);

    // Tag gems and sort by BPM for natural DJ flow
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
