'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Search, Loader2, Save, ExternalLink, Gem,
  Zap, LogIn, LogOut, Disc3, Play, Pause, Volume2,
  SkipForward, SkipBack,
} from 'lucide-react';

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  preview_url: string | null;
  popularity: number;
  uri: string;
  tempo?: number;
  key?: number;
  mode?: number;
  isHiddenGem?: boolean;
  badge?: string;
  matchScore?: number;
}

interface SessionState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user?: { id: string; display_name: string };
}

const CAMELOT: Record<string, string> = {
  '0_1': '8B', '1_1': '3B', '2_1': '10B', '3_1': '5B', '4_1': '12B', '5_1': '7B',
  '6_1': '2B', '7_1': '9B', '8_1': '4B', '9_1': '11B', '10_1': '6B', '11_1': '1B',
  '0_0': '5A', '1_0': '12A', '2_0': '7A', '3_0': '2A', '4_0': '9A', '5_0': '4A',
  '6_0': '11A', '7_0': '6A', '8_0': '1A', '9_0': '8A', '10_0': '3A', '11_0': '10A',
};

function getCamelotKey(key: number, mode: number): string {
  return CAMELOT[`${key}_${mode}`] || '?';
}

const SEEDS = [
  'Hypnotize', '128 BPM', 'Afrobeats vibe', 'late night techno',
  'house music', '140 BPM', 'disco funk',
];

function BadgeChip({ badge }: { badge: string }) {
  const cls =
    badge === 'Perfect Mashup' ? 'badge badge-mashup' :
    badge === 'Floor Filler' ? 'badge badge-filler' :
    badge === 'Hidden Gem' ? 'badge badge-gem' :
    'badge badge-good';
  return <span className={cls}>{badge}</span>;
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
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.volume = volume;

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      // Auto-advance to next track
      if (currentTrack) {
        const idx = tracks.findIndex(t => t.id === currentTrack.id);
        const next = tracks[idx + 1];
        if (next?.preview_url) playTrack(next);
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [currentTrack, tracks, volume]);

  const playTrack = useCallback((track: SpotifyTrack) => {
    if (!track.preview_url) return;
    const audio = audioRef.current!;
    if (currentTrack?.id === track.id) {
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else { audio.play(); setIsPlaying(true); }
      return;
    }
    audio.src = track.preview_url;
    audio.play();
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    }, 200);
  }, [currentTrack, isPlaying]);

  const skipTrack = (dir: 1 | -1) => {
    if (!currentTrack) return;
    const idx = tracks.findIndex(t => t.id === currentTrack.id);
    const next = tracks[idx + dir];
    if (next?.preview_url) playTrack(next);
  };

  const handleLogin = () => { window.location.href = '/api/auth'; };
  const handleLogout = () => {
    setSession(null); setTracks([]); setSavedUrl('');
    audioRef.current?.pause(); setIsPlaying(false); setCurrentTrack(null);
  };

  const handleGenerate = useCallback(async (seedOverride?: string) => {
    const seed = seedOverride ?? query.trim();
    if (!seed) return;
    if (!session) { setError('Connect Spotify first.'); return; }
    setIsGenerating(true);
    setError('');
    setTracks([]);
    setSavedUrl('');
    audioRef.current?.pause();
    setIsPlaying(false);
    setCurrentTrack(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seed, accessToken: session.accessToken }),
      });
      if (!res.ok) { const { error: e } = await res.json(); throw new Error(e || 'Generation failed'); }
      const { tracks: generated } = await res.json();
      setTracks(generated);
      setPlaylistName(`${seed.slice(0, 30).toUpperCase()} — DJ SET`);
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
          trackUris: tracks.map(t => t.uri),
          accessToken: session.accessToken,
          userId: session.user?.id,
        }),
      });
      if (!res.ok) { const { error: e } = await res.json(); throw new Error(e || 'Save failed'); }
      const { playlistUrl } = await res.json();
      setSavedUrl(playlistUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save playlist');
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--red)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Disc3 size={16} color="white" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}>
              DJ Set Architect
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', background: 'var(--red-glow)', border: '1px solid var(--red-dim)', padding: '2px 6px', borderRadius: 2, letterSpacing: '0.1em' }}>
              BETA
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {session?.user && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {session.user.display_name.toUpperCase()}
              </span>
            )}
            {session ? (
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                <LogOut size={14} />DISCONNECT
              </button>
            ) : (
              <button onClick={handleLogin} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                <LogIn size={14} />CONNECT SPOTIFY
              </button>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1, marginBottom: 8, color: 'var(--text)' }}>
            BUILD YOUR<br />
            <span style={{ color: 'var(--red)', WebkitTextStroke: '1px var(--red)' }}>NEXT SET.</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 300, letterSpacing: '0.02em' }}>
            Drop a song, BPM, or vibe — get 20 DJ-ready tracks ranked by key compatibility & danceability.
          </p>
        </div>

        {/* Search */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                className="search-input"
                style={{ width: '100%', paddingLeft: 42, paddingRight: 16, paddingTop: 12, paddingBottom: 12, borderRadius: 4, fontSize: 15, fontFamily: 'var(--font-body)' }}
                placeholder="Song, artist, BPM or vibe…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              />
            </div>
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating || !query.trim()}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {isGenerating ? <Loader2 size={14} className="spinner" /> : <Zap size={14} />}
              {isGenerating ? 'BUILDING…' : 'GENERATE'}
            </button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', marginRight: 4 }}>TRY:</span>
            {SEEDS.map(s => (
              <button key={s} onClick={() => { setQuery(s); handleGenerate(s); }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 2, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.05em', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--red)'; (e.target as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
              >{s}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(230,51,18,0.1)', border: '1px solid rgba(230,51,18,0.3)', color: '#ff6b6b', borderRadius: 4, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Track list */}
        {tracks.length > 0 && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <input
                  value={playlistName}
                  onChange={e => setPlaylistName(e.target.value)}
                  style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', outline: 'none', paddingBottom: 2 }}
                />
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>{tracks.length} TRACKS</span>
                  <span style={{ color: 'var(--border-bright)' }}>|</span>
                  <span style={{ color: 'var(--green)' }}>{tracks.filter(t => !t.isHiddenGem).length} FILLERS</span>
                  <span style={{ color: 'var(--border-bright)' }}>|</span>
                  <span style={{ color: 'var(--orange)' }}>{tracks.filter(t => t.isHiddenGem).length} GEMS</span>
                  <span style={{ color: 'var(--border-bright)' }}>|</span>
                  <span style={{ color: 'var(--amber)' }}>{tracks.filter(t => t.badge === 'Perfect Mashup').length} MASHUPS</span>
                </div>
              </div>
              {savedUrl ? (
                <a href={savedUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--green)', color: '#000', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', padding: '10px 20px', borderRadius: 4, textDecoration: 'none' }}>
                  <ExternalLink size={14} />OPEN IN SPOTIFY
                </a>
              ) : (
                <button onClick={handleSave} disabled={isSaving || !session}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {isSaving ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
                  {isSaving ? 'SAVING…' : 'SAVE TO SPOTIFY'}
                </button>
              )}
            </div>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 48px 1fr 1fr 140px 80px', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              <span>#</span><span></span><span>TRACK</span><span>ARTIST / ALBUM</span><span>TAGS</span><span style={{ textAlign: 'right' }}>SCORE</span>
            </div>

            {tracks.map((track, i) => {
              const art = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
              const camelotKey = track.key !== undefined && track.mode !== undefined ? getCamelotKey(track.key, track.mode) : null;
              const isActive = currentTrack?.id === track.id;
              const hasPreview = !!track.preview_url;
              return (
                <div key={track.id} className="track-row"
                  style={{
                    display: 'grid', gridTemplateColumns: '32px 48px 1fr 1fr 140px 80px', gap: 8,
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    background: isActive ? 'rgba(230,51,18,0.06)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                    alignItems: 'center', cursor: hasPreview ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                    animationDelay: `${i * 25}ms`,
                  }}
                  onClick={() => hasPreview && playTrack(track)}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Number / play icon */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                    {isActive && isPlaying
                      ? <span className="playing-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />
                      : hasPreview
                      ? <span style={{ color: isActive ? 'var(--red)' : 'var(--text-dim)' }}>{isActive ? <Pause size={12} /> : <Play size={12} />}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
                    }
                  </span>

                  {/* Album art */}
                  <div style={{ width: 40, height: 40, borderRadius: 2, overflow: 'hidden', background: 'var(--surface-3)', flexShrink: 0 }}>
                    {art && <img src={art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>

                  {/* Track name + badge */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: isActive ? 'var(--red)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {track.name}
                      </span>
{!hasPreview && (
                      <a href={track.external_urls?.spotify} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 2, textDecoration: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--green)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                        <ExternalLink size={8} />OPEN
                      </a>
                    )}                    </div>
                    {track.badge && track.badge !== 'Discovered' && <BadgeChip badge={track.badge} />}
                  </div>

                  {/* Artist / album */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                      {track.artists?.map(a => a.name).join(', ')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.album?.name}
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {track.tempo && <span className="tag">{Math.round(track.tempo)} BPM</span>}
                    {camelotKey && <span className="tag">{camelotKey}</span>}
                    {track.isHiddenGem && <span className="tag" style={{ color: 'var(--orange)', borderColor: 'rgba(255,107,53,0.3)' }}><Gem size={8} style={{ display: 'inline', marginRight: 2 }} />GEM</span>}
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: track.matchScore && track.matchScore >= 70 ? 'var(--amber)' : track.matchScore && track.matchScore >= 40 ? 'var(--green)' : 'var(--text-dim)' }}>
                    {track.matchScore !== undefined ? `${track.matchScore}` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!tracks.length && !isGenerating && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
            <div style={{ width: 64, height: 64, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Disc3 size={28} color="var(--text-dim)" />
            </div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>YOUR SET STARTS HERE</p>
            <p style={{ fontSize: 13, fontWeight: 300 }}>Enter a song, tempo, or vibe above</p>
          </div>
        )}
      </main>

      {/* Mini Player */}
      {currentTrack && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', zIndex: 100, boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}>
          <div className="progress-bar" onClick={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) { audioRef.current.currentTime = pct * audioRef.current.duration; setProgress(pct); }
          }}>
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              {currentTrack.album?.images?.[2]?.url && <img src={currentTrack.album.images[2].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{currentTrack.artists?.map(a => a.name).join(', ')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => skipTrack(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><SkipBack size={18} /></button>
              <button onClick={() => playTrack(currentTrack)}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--red)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => skipTrack(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><SkipForward size={18} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Volume2 size={14} color="var(--text-dim)" />
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={e => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }}
                style={{ width: 80, accentColor: 'var(--red)' }} />
            </div>
            {currentTrack.badge && currentTrack.badge !== 'Discovered' && <BadgeChip badge={currentTrack.badge} />}
          </div>
        </div>
      )}

      <footer style={{ borderTop: '1px solid var(--border)', marginTop: currentTrack ? 100 : 48 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          <span>DJ SET ARCHITECT — POWERED BY SPOTIFY</span>
          <span>© {new Date().getFullYear()} NOWOPS</span>
        </div>
      </footer>
    </div>
  );
}
