import { NextRequest, NextResponse } from 'next/server';
import {
  searchTracks,
  getRecommendations,
  getRecommendationsByGenre,
  getAudioFeatures,
  mergeAudioFeatures,
  isBPMQuery,
  parseBPM,
  vibeToGenre,
  type SpotifyTrack,
} from '@/lib/spotify';

const TARGET_TOTAL = 20;
const POPULAR_TARGET = Math.round(TARGET_TOTAL * 0.7);
const GEM_TARGET = TARGET_TOTAL - POPULAR_TARGET;

function isDJFriendly(track: SpotifyTrack & { energy?: number; danceability?: number }): boolean {
  if (track.energy === undefined || track.danceability === undefined) return true;
  return track.energy >= 0.5 && track.danceability >= 0.5;
}

function isHiddenGem(track: SpotifyTrack): boolean {
  return track.popularity < 40;
}

function isPopularTrack(track: SpotifyTrack): boolean {
  return track.popularity >= 40;
}

function dedup(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
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

    let recTracks: SpotifyTrack[] = [];

    if (isBPMQuery(query)) {
      const bpm = parseBPM(query);
      const bpmRange = 10;
      const [r1, r2] = await Promise.all([
        getRecommendationsByGenre('dance', accessToken, 50),
        getRecommendationsByGenre('electronic', accessToken, 50),
      ]);
      const allRecs = dedup([...r1, ...r2]);
      const feats = await getAudioFeatures(allRecs.map((t) => t.id), accessToken);
      const withFeats = mergeAudioFeatures(allRecs, feats) as (SpotifyTrack & { tempo?: number; energy?: number; danceability?: number })[];
      recTracks = withFeats.filter((t) => {
        if (!t.tempo) return false;
        const tempos = [t.tempo, t.tempo * 2, t.tempo / 2];
        return tempos.some((candidate) => Math.abs(candidate - bpm) <= bpmRange);
      });
    } else {
      const searchResults = await searchTracks(query, accessToken, 10);
      const seedTracks = searchResults.slice(0, 5);
      if (seedTracks.length > 0) {
        const seedIds = seedTracks.map((t) => t.id);
        const [popular, gems] = await Promise.all([
          getRecommendations(seedIds, accessToken, 0.8, 0.75, 50),
          getRecommendations(seedIds, accessToken, 0.75, 0.7, 50),
        ]);
        recTracks = dedup([...popular, ...gems]);
      } else {
        const genre = vibeToGenre(query);
        const [r1, r2] = await Promise.all([
          getRecommendationsByGenre(genre, accessToken, 50),
          getRecommendationsByGenre('dance', accessToken, 30),
        ]);
        recTracks = dedup([...r1, ...r2]);
      }
    }

    const featureIds = recTracks.map((t) => t.id);
    const features = await getAudioFeatures(featureIds.slice(0, 100), accessToken);
    const enrichedRecs = mergeAudioFeatures(recTracks, features) as (SpotifyTrack & { energy?: number; danceability?: number })[];
    const djFriendly = enrichedRecs.filter(isDJFriendly);

    const populars = djFriendly.filter(isPopularTrack).sort((a, b) => b.popularity - a.popularity);
    const gems = djFriendly.filter(isHiddenGem).sort(() => Math.random() - 0.5);

    let combined = dedup([...populars.slice(0, POPULAR_TARGET), ...gems.slice(0, GEM_TARGET)]);
    if (combined.length < TARGET_TOTAL) {
      const remaining = djFriendly.filter((t) => !combined.find((c) => c.id === t.id));
      combined = dedup([...combined, ...remaining]).slice(0, TARGET_TOTAL);
    }
    combined = combined.slice(0, TARGET_TOTAL);

    const finalTracks = combined.map((t) => ({ ...t, isHiddenGem: isHiddenGem(t) }));
    finalTracks.sort((a: SpotifyTrack & { tempo?: number }, b: SpotifyTrack & { tempo?: number }) => {
      return (a.tempo ?? 0) - (b.tempo ?? 0);
    });

    return NextResponse.json({ tracks: finalTracks });
  } catch (e) {
    console.error('Generate error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate playlist' },
      { status: 500 }
    );
  }
}
