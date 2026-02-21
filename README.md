# 🎛️ DJ Set Architect

A Next.js app that generates 20-song DJ-ready playlists from any seed — song name, BPM, or vibe — using the Spotify Web API.

**Curation logic:** 70% popular tracks + 30% hidden gems (popularity < 40), all filtered for high energy & danceability. Tracks sorted by BPM for natural DJ flow.

---

## Quick Start

### 1. Create a Spotify App

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **"Create app"**
3. Fill in:
   - **App name:** DJ Set Architect
   - **App description:** Personal DJ playlist generator
   - **Redirect URI:** `http://localhost:3000/api/callback`
     *(For production, also add your live domain, e.g. `https://yourapp.com/api/callback`)*
4. Check **"Web API"** under APIs used
5. Click **Save**
6. Go to **Settings** → copy your **Client ID** and **Client Secret**

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
SPOTIFY_CLIENT_ID=your_client_id_from_dashboard
SPOTIFY_CLIENT_SECRET=your_client_secret_from_dashboard
NEXTAUTH_URL=http://localhost:3000
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you're set.

---

## How to Use

1. **Connect Spotify** — click the top-right button to authorize
2. **Enter a seed** in the search bar:
   - A song: `"Levitating by Dua Lipa"` or just `"Levitating"`
   - A BPM: `"128"` or `"128 BPM"`
   - A vibe: `"late night techno"`, `"afrobeats"`, `"chill house"`
3. **Click Generate** (or press Enter)
4. Review your 20-track set — hidden gems are marked with a 💎 icon
5. **Click the playlist name** to rename it
6. **Save to Spotify** — creates a private playlist in your account

---

## Project Structure

```
dj-set-architect/
├── app/
│   ├── page.tsx                    # Main UI (search, track list, save)
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Paper/parchment theme + animations
│   └── api/
│       ├── auth/route.ts           # Initiates OAuth2 flow
│       ├── callback/route.ts       # Handles OAuth2 callback
│       ├── generate/route.ts       # Core curation logic
│       └── save-playlist/route.ts  # Creates Spotify playlist
├── lib/
│   └── spotify.ts                  # Spotify API utility functions
├── tailwind.config.js              # Custom theme (parchment palette)
├── .env.example                    # Environment variable template
└── README.md
```

---

## Curation Algorithm

The `/api/generate` endpoint works as follows:

```
Input: "Levitating" (song)  │  "128 BPM"         │  "afrobeats vibe"
                            │                    │
Search Spotify → seed IDs   │  Genre recs        │  Genre mapping
                            │  + BPM filter      │  → genre recommendations
         ↓                  │        ↓           │        ↓
Spotify Recommendations     │   Audio features   │   Audio features
(50 candidates)             │   tempo filter     │   no extra filter
         ↓                  │        ↓           │        ↓
Fetch audio features (BPM, energy, danceability, key)
         ↓
Filter: energy ≥ 0.5 AND danceability ≥ 0.5 (DJ Friendly)
         ↓
Split: popularity ≥ 40 → Popular pool (target 14/20)
       popularity < 40  → Hidden Gems pool (target 6/20)
         ↓
Sort by BPM for natural DJ set flow
```

---

## Deployment (Production)

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Set these environment variables in your Vercel dashboard:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `NEXTAUTH_URL` → your production URL (e.g. `https://dj-architect.vercel.app`)

**Important:** Add your production redirect URI to your Spotify app:
`https://your-domain.com/api/callback`

---

## Security Notes

This prototype passes tokens in URL params for simplicity. For production:
- Use **httpOnly cookies** or a server-side session store (e.g. Redis)
- Implement token refresh logic using the `refresh_token`
- Add CSRF state validation in the OAuth callback

---

## Tech Stack

- **Next.js 14** (App Router)
- **Tailwind CSS** (parchment/paper theme)
- **Lucide Icons**
- **Spotify Web API** (OAuth2, Search, Recommendations, Audio Features)
