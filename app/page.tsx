'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Search, Music2, Loader2, Save, ExternalLink, Gem,
  Zap, LogIn, LogOut, ChevronRight, Disc3,
} from 'lucide-react';

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  popularity: number;
  uri: string;
  tempo?: number;
  key?: number;
  mode?: number;
  isHiddenGem?: boolean;
}

interface SessionState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user?: { id: string; display_name: string };
}

const SEED_SUGGESTIONS = [
  'Dua Lipa - Levitating', '128 BPM', 'Afrobeats vibe',
  'late night techno', 'house music', '140 BPM', 'summer festival', 'disco funk',
];

const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    const refresh = params.get('refresh_token');
    const expires = params.get('expires_at');
    const userId = params.get('user_id');
    const displayName = params.get('display_name');
    if (token && refresh && expires) {
      setSession({
        accessToken: token,
        refreshToken: refresh,
        expiresAt: Number(expires),
        user: userId ? { id: userId, display_name: displayName || 'DJ' } : undefined,
      });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogin = () => { window.location.href = '/api/auth'; };
  const handleLogout = () => { setSession(null); setTracks([]); setSavedUrl(''); };

  const handleGenerate = useCallback(async (seedOverride?: string) => {
    const seed = seedOverride ?? query.trim();
    if (!seed) return;
    if (!session) { setError('Please connect Spotify first.'); return; }
    setIsGenerating(true);
    setError('');
    setTracks([]);
    setSavedUrl('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seed, accessToken: session.accessToken }),
      });
      if (!res.ok) { const { error: e } = await res.json(); throw new Error(e || 'Generation failed'); }
      const { tracks: generated } = await res.json();
      setTracks(generated);
      setPlaylistName(`DJ Set: ${seed.slice(0, 30)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }, [query, session]);

  const handleSave = async () => {
    if (!session || !tracks.length) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/save-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playlistName || 'DJ Set Architect Mix',
          trackUris: tracks.map((t) => t.uri),
          accessToken: session.accessToken,
          userId: session.user?.id,
        }),
      });
      if (!res.ok) { const { error: e } = await res.json(); throw new Error(e || 'Save failed'); }
      const { playlistUrl } = await res.json();
      setSavedUrl(playlistUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save playlist');
