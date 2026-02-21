'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Search,
  Music2,
  Loader2,
  Save,
  ExternalLink,
  Gem,
  Zap,
  LogIn,
  LogOut,
  ChevronRight,
  Disc3,
} from 'lucide-react';
import type { SpotifyTrack } from '@/lib/spotify';

interface GeneratedTrack extends SpotifyTrack {
  isHiddenGem?: boolean;
}

interface SessionState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user?: { id: string; display_name: string };
}

const SEED_SUGGESTIONS = [
  'Dua Lipa - Levitating',
  '128 BPM',
  'Afrobeats vibe',
  'late night techno',
  'Disco Elysium',
  'house music',
  '140 BPM',
  'summer festival',
];

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<GeneratedTrack[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const suggestionIndex = useRef(0);

  // ── Auth ────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    window.location.href = '/api/auth';
  };

  const handleLogout = () => {
    setSession(null);
    setTracks([]);
    setSavedUrl('');
  };

  // Pick up session from URL after OAuth redirect
  const initSessionFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
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
      // Clean URL
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Run once on mount via ref trick
  const ranInit = useRef(false);
  if (!ranInit.current && typeof window !== 'undefined') {
    ranInit.current = true;
    initSessionFromUrl();
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async (seedOverride?: string) => {
    const seed = seedOverride ?? query.trim();
    if (!seed) return;
    if (!session) { setError('Please connect Spotify first to generate playlists.'); return; }

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
      if (!res.ok) {
        const { error: e } = await res.json();
        throw new Error(e || 'Generation failed');
      }
      const { tracks: generated } = await res.json();
      setTracks(generated);
      // Auto-name the playlist
      setPlaylistName(`DJ Set: ${seed.slice(0, 30)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Save to Spotify ───────────────────────────────────────────────────────
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
      if (!res.ok) {
        const { error: e } = await res.json();
        throw new Error(e || 'Save failed');
      }
      const { playlistUrl } = await res.json();
      setSavedUrl(playlistUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save playlist');
    } finally {
      setIsSaving(false);
    }
  };

  const cycleSuggestion = () => {
    suggestionIndex.current = (suggestionIndex.current + 1) % SEED_SUGGESTIONS.length;
    setQuery(SEED_SUGGESTIONS[suggestionIndex.current]);
  };

  const popularCount = tracks.filter((t) => !t.isHiddenGem).length;
  const gemCount = tracks.filter((t) => t.isHiddenGem).length;

  return (
    <div className="min-h-screen bg-parchment relative z-10">
      {/* Header */}
      <header className="border-b border-clay/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-charcoal rounded-lg flex items-center justify-center">
              <Disc3 className="w-4 h-4 text-parchment" />
            </div>
            <span className="font-semibold text-charcoal tracking-tight text-lg">
              DJ Set Architect
            </span>
          </div>

          <div className="flex items-center gap-3">
            {session?.user && (
              <span className="text-sm text-charcoal-muted hidden sm:block">
                {session.user.display_name}
              </span>
            )}
            {session ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-charcoal-muted hover:text-charcoal transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 bg-charcoal text-parchment text-sm font-medium px-4 py-2 rounded-lg hover:bg-charcoal/80 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Connect Spotify
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-light text-charcoal tracking-tight mb-3">
            Build your next set.
          </h1>
          <p className="text-charcoal-muted text-lg font-light">
            Drop a song, BPM, or vibe — get 20 DJ-ready tracks in seconds.
          </p>
        </div>

        {/* Search */}
        <div className="bg-surface rounded-2xl shadow-card p-6 mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-muted" />
              <input
                className="search-input w-full pl-11 pr-4 py-3.5 bg-parchment border border-clay rounded-xl text-charcoal placeholder-charcoal-muted text-base font-light transition-shadow"
                placeholder="Song name, BPM, or vibe…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
            </div>
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating || !query.trim()}
              className="flex items-center gap-2 bg-charcoal text-parchment font-medium px-6 py-3.5 rounded-xl hover:bg-charcoal/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 spinner" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{isGenerating ? 'Building…' : 'Generate'}</span>
            </button>
          </div>

          {/* Suggestions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-charcoal-muted mr-1 self-center">Try:</span>
            {SEED_SUGGESTIONS.slice(0, 5).map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); handleGenerate(s); }}
                className="text-xs px-3 py-1.5 bg-parchment border border-clay rounded-full text-charcoal-light hover:border-clay-dark hover:text-charcoal transition-colors"
              >
                {s}
              </button>
            ))}
            <button
              onClick={cycleSuggestion}
              className="text-xs px-3 py-1.5 text-charcoal-muted hover:text-charcoal transition-colors"
            >
              more…
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3.5 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {tracks.length > 0 && (
          <div className="animate-fade-in">
            {/* Playlist header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-3">
                  <input
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="text-xl font-medium text-charcoal bg-transparent border-b border-transparent hover:border-clay focus:border-accent-light focus:outline-none transition-colors pr-2"
                  />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-charcoal-muted">
                  <span>{tracks.length} tracks</span>
                  <span className="w-1 h-1 rounded-full bg-clay-dark inline-block" />
                  <span className="flex items-center gap-1">
                    <Music2 className="w-3 h-3" />
                    {popularCount} popular
                  </span>
                  <span className="w-1 h-1 rounded-full bg-clay-dark inline-block" />
                  <span className="flex items-center gap-1 text-accent">
                    <Gem className="w-3 h-3" />
                    {gemCount} hidden gems
                  </span>
                </div>
              </div>

              {savedUrl ? (
                <a
                  href={savedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-green-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Spotify
                </a>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={isSaving || !session}
                  className="flex items-center gap-2 bg-charcoal text-parchment text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-charcoal/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title={!session ? 'Connect Spotify to save' : ''}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 spinner" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSaving ? 'Saving…' : 'Save to Spotify'}
                </button>
              )}
            </div>

            {/* Track table */}
            <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
              <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_1fr_auto] gap-0 text-xs font-medium text-charcoal-muted uppercase tracking-wider px-5 py-3 border-b border-clay/50">
                <span>#</span>
                <span>Track / Artist</span>
                <span className="hidden sm:block">Album</span>
                <span className="text-right">Tags</span>
              </div>

              {tracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i} />
              ))}
            </div>

            {!session && (
              <p className="text-center text-charcoal-muted text-sm mt-5">
                <button onClick={handleLogin} className="text-accent hover:underline font-medium">
                  Connect Spotify
                </button>{' '}
                to save this playlist to your account.
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!tracks.length && !isGenerating && (
          <div className="text-center py-20 text-charcoal-muted">
            <div className="w-16 h-16 bg-clay rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Disc3 className="w-8 h-8 text-charcoal-muted" />
            </div>
            <p className="text-lg font-light mb-2">Your set starts here</p>
            <p className="text-sm">Enter a song, tempo, or vibe above to build your playlist</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-clay/60 mt-20">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-charcoal-muted">
          <span>DJ Set Architect — powered by Spotify</span>
          <a
            href="https://developer.spotify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-charcoal transition-colors"
          >
            Spotify API <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}

// ── Track Row Component ──────────────────────────────────────────────────────
function TrackRow({ track, index }: { track: GeneratedTrack; index: number }) {
  const albumArt = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
  const camelotKey =
    track.key !== undefined && track.mode !== undefined
      ? getCamelotKeyClient(track.key, track.mode)
      : null;

  return (
    <div
      className="track-row grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_1fr_auto] gap-0 px-5 py-3.5 border-b border-clay/30 last:border-0 hover:bg-parchment/60 transition-colors group items-center"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Index */}
      <span className="text-sm text-charcoal-muted font-mono group-hover:hidden">
        {index + 1}
      </span>
      <a
        href={track.external_urls?.spotify}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden group-hover:flex items-center"
      >
        <ExternalLink className="w-3.5 h-3.5 text-accent" />
      </a>

      {/* Track + Artist */}
      <div className="flex items-center gap-3 min-w-0">
        {albumArt && (
          <img
            src={albumArt}
            alt={track.album.name}
            className="w-9 h-9 rounded-md object-cover flex-shrink-0 shadow-sm"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-charcoal truncate">{track.name}</p>
            {track.isHiddenGem && (
              <span className="gem-badge flex-shrink-0">
                <Gem className="w-3 h-3 text-accent" />
              </span>
            )}
          </div>
          <p className="text-xs text-charcoal-muted truncate">
            {track.artists?.map((a) => a.name).join(', ')}
          </p>
        </div>
      </div>

      {/* Album */}
      <p className="hidden sm:block text-xs text-charcoal-muted truncate pr-4">
        {track.album?.name}
      </p>

      {/* Tags */}
      <div className="flex items-center gap-1.5 justify-end flex-shrink-0">
        {track.tempo && (
          <span className="tag">{Math.round(track.tempo)} BPM</span>
        )}
        {camelotKey && (
          <span className="tag">{camelotKey}</span>
        )}
      </div>
    </div>
  );
}

// Client-side Camelot key lookup
function getCamelotKeyClient(key: number, mode: number): string {
  const CAMELOT: Record<string, string> = {
    '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
    '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
    '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
    '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
  };
  return CAMELOT[`${key}_${mode}`] || '?';
}
