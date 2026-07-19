# Arostream (Monochrome) — Project Reference for LLMs

> A free, open-source TIDAL music streaming client with Hi-Res FLAC, downloads, equalizer, visualizer, listening parties, scrobbling, and cross-provider search (TIDAL, JioSaavn, YouTube Music, PodcastIndex).

---

## 1. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Vanilla JS (ES modules), no framework |
| Build | Vite 7 + vitest 4 + Playwright |
| Audio | Web Audio API, Shaka Player (DASH), HLS.js |
| Storage | IndexedDB (favorites, history, playlists, cache) + localStorage (settings) |
| Streaming | TIDAL HiFi proxy instances, JioSaavn REST API, YouTube Music (yt-dlp), Amazon Music (Service Worker decrypter) |
| Auth | Appwrite (email/OAuth: Google, Discord, GitHub), PocketBase |
| Mobile | Capacitor (iOS/Android) |
| Backend | Cloudflare Functions, Node.js YouTube API server |
| Visualizer | Butterchurn (MilkDrop WebGL) |
| Lyrics | AM-Lyrics component (`@uimaxbai/am-lyrics`) |
| Transcoding | ffmpeg.wasm |
| Metadata | taglib-ts |

---

## 2. Directory Structure

```
/
├── index.html                 # Main HTML entry (6707 lines)
├── page_content.html          # Alternate entry (same structure, inline SVGs)
├── styles.css                 # All styles (12717 lines)
├── vite.config.ts             # Build config + PWA + dev proxy
├── package.json               # arostream v2.5.1
├── AGENTS.md                  # ← THIS FILE
│
├── js/                        # All JS source
│   ├── app.js                 # Entry point — initializes all modules
│   ├── api.js                 # LosslessAPI — TIDAL proxy communication
│   ├── ui.js                  # UIRenderer — all page rendering (7639 lines)
│   ├── player.js              # Player — audio playback engine
│   ├── router.js              # Client-side router
│   ├── music-api.js           # MusicAPI — unified provider interface
│   ├── db.js                  # MusicDatabase — IndexedDB wrapper
│   ├── storage.js             # Settings managers (localStorage)
│   ├── cache.js               # APICache — memory + IndexedDB cache
│   ├── events.js              # Player events + track interactions
│   ├── ui-interactions.js     # UI interaction handlers
│   ├── audio-context.js       # AudioContextManager + EQ DSP
│   ├── equalizer.js           # Equalizer UI logic
│   ├── container-classes.ts   # Data models (Track, Album, Artist, etc.)
│   ├── HiFi.ts                # HiFiClient — native TIDAL API queries
│   ├── jiosaavn-api.js        # JioSaavn provider
│   ├── youtube-music-api.js   # YouTube Music provider
│   ├── podcasts-api.js        # PodcastIndex provider
│   ├── lyrics.js              # Lyrics panel
│   ├── downloads.js           # Download manager
│   ├── settings.js            # Settings UI (7340 lines)
│   ├── side-panel.js          # Resizable queue/lyrics side panel
│   ├── visualizer.js          # Butterchurn visualizer
│   ├── playlist-importer.js   # Import CSV/JSPF/XSPF/XML/M3U
│   ├── playlist-generator.js  # Export CSV/JSON/M3U/M3U8/CUE/NFO
│   ├── multi-scrobbler.js     # Unified scrobbling dispatcher
│   ├── smart-recommendations.js # ML-based recommendations
│   ├── tracker.js             # Unreleased music tracker (Google Sheets)
│   ├── themeStore.js          # Community theme store
│   ├── commandPalette.js      # Cmd+K palette
│   ├── profile.js             # User profile page
│   ├── listening-party.js     # WebSocket real-time parties
│   ├── proxy-utils.js         # Audio proxy URL wrapping
│   ├── content-filter.ts      # Content blocking (copyright)
│   ├── ffmpeg.js              # ffmpeg.wasm wrapper
│   ├── taglib.ts              # Audio metadata tag reading/writing
│   ├── utils.js               # Shared utilities
│   ├── icons.ts               # SVG icon constants
│   ├── platform-detection.ts  # Browser/OS detection
│   ├── vibrant-color.js       # Color extraction from album art
│   ├── waveform.js            # Audio waveform generation
│   ├── haptics.js             # Capacitor haptic feedback
│   ├── equalizer-presets.js   # EQ preset definitions
│   ├── autoeq-engine.js       # AutoEQ algorithm
│   ├── binaural-dsp.js        # Binaural audio DSP
│   ├── listenbrainz.js        # ListenBrainz scrobbler
│   ├── lastfm.js              # Last.fm scrobbler
│   ├── librefm.js             # LibreFM scrobbler
│   ├── maloja.js              # Maloja scrobbler
│   ├── md5.js                 # MD5 hash utility
│   ├── hrtf-generator.js      # HRTF data for binaural
│   └── accounts/              # Auth + sync
│       ├── auth.js            # Appwrite auth
│       ├── authApi.js         # Auth HTTP API
│       ├── config.js          # Auth config
│       └── pocketbase.js      # PocketBase sync
│
├── server/
│   ├── youtube-api.mjs        # Node.js YouTube proxy (port 8787)
│   └── youtube-handler.mjs    # YouTube search/stream resolution
│
├── functions/                 # Cloudflare Workers
│   └── library/, userplaylist/, user/
│
├── database/
│   └── pb_schema.json         # PocketBase schema
│
├── public/fonts/              # SF Pro Display font
├── images/                    # App images
├── assets/                    # Static assets
├── android/                   # Capacitor Android
├── ios/                       # Capacitor iOS
├── docker/                    # Docker deployment
└── dist/                      # Build output
```

---

## 3. Core Architecture

### Initialization Order (`app.js:452-705`)

```
DOMContentLoaded
  → ThemeStore.init()
  → HiFiClient.initialize()
  → MusicAPI.initialize(apiSettings)
  → Player.initialize(audioPlayer, api, quality)
  → initTracker()
  → UIRenderer.initialize(api, player)
  → LyricsManager.initialize()
  → MultiScrobbler initialization
  → Settings module init
  → initializePlayerEvents()
  → initializeTrackInteractions()
  → initializeUIInteractions()
  → initializeKeyboardShortcuts()
  → Router init → render current route
```

### Layout (`index.html`)

```
.app-container (CSS Grid)
├── .sidebar (210px, glass background, flex column)
│   ├── .sidebar-logo (logo + name + collapse btn)
│   ├── .sidebar-nav.main (Home, Library, Recent, Unreleased, Donate, Settings)
│   └── .sidebar-bottom-container
│       ├── #pinned-items-nav (dynamic — max 3)
│       └── .sidebar-nav.bottom (About, Mobile, Parties, GitHub)
├── .main-content (scrollable, padding-bottom for player)
│   ├── .main-header (nav back/forward, hamburger, search bar, account)
│   ├── #page-background (dynamic background)
│   └── #page-* containers (home, album, artist, search, library, etc.)
└── footer.now-playing-bar (fixed, floating glass mini-player)
    ├── .track-info (cover + title/album/artist)
    ├── .player-controls (shuffle, prev, play/pause, next, repeat, progress)
    └── .volume-controls (party, like, queue, lyrics, download, cast, volume, sleep)
```

**CSS Grid Template** (desktop): `'sidebar main' 1fr / 'player player' auto / 210px 1fr`
**Mobile**: Sidebar becomes overlay, player shrinks.

### Page system
Each page is a `<div id="page-{name}">` inside `.main-content`. Pages are hidden/shown via `showPage()`. Content is rendered dynamically by `UIRenderer` methods.

---

## 4. Key Classes

### `UIRenderer` (`js/ui.js` — singleton via `UIRenderer.instance`)

The main rendering engine. Properties set in `initialize()`:
- `this.api` — MusicAPI instance
- `this.player` — Player instance
- `this.lock` — render lock (prevents concurrent renders)

**Render methods** (called by router):

| Method | Page |
|--------|------|
| `renderHomePage()` | Home — greeting, recent tracks, recommended songs/albums/artists |
| `renderSearchPage(query)` | Search results (tracks/artists/albums/videos) |
| `renderAlbumPage(id)` | Album detail + track list + similar |
| `renderArtistPage(id)` | Artist profile (bio, top tracks, albums, socials) |
| `renderPlaylistPage(id, type)` | Playlist (api/user) |
| `renderMixPage(id)` | Dynamic mix |
| `renderTrackPage(id)` | Single track detail |
| `renderLibraryPage()` | Library (favorites, playlists, folders, local files) |
| `renderRecentPage()` | Listening history |
| `renderUnreleasedPage()` | Tracker artists/projects |
| `renderPodcastPage(id)` / `renderPodcastsBrowsePage()` | Podcasts |
| `renderPartiesPage()` / `renderPartyDetailPage(id)` | Listening parties |

**Card creation helpers**:
- `createTrackItemHTML(track, index, showCover, hasMultipleDiscs, useTrackNumber, inlineLike)` — track row
- `createAlbumCardHTML(album)` — album card
- `createArtistCardHTML(artist)` — artist card
- `createPlaylistCardHTML(playlist)` — playlist card
- `createVideoCardHTML(video)` — video card
- `createBaseCardHTML({type, id, href, title, subtitle, imageHTML, ...})` — base card template

**Home page flow** (`renderHomePage`):
1. `showPage('home')` + `setupHomeTabs()`
2. Hide greeting/welcome elements
3. Render recent activity
4. If user has 3+ seeds (listened tracks), fetch personalized recommendations via `renderHomeSongs/Albums/Artists(seeds)`
5. Else fetch cached default content from IndexedDB, or call `fetchAndCacheDefaultContent()` to fetch from API

**`fetchAndCacheDefaultContent()`**: Searches diverse queries across tracks/albums/artists (parallel via `Promise.allSettled`), caches results to IndexedDB, renders into home sections. Filters out `SINGLE` album type.

### `Player` (`js/player.js` — singleton via `Player.instance`)

Audio playback engine. Properties in constructor:
- `this.audio` — `<audio id="audio-player">`
- `this.video` — `<video id="video-player">`
- `this.api` — MusicAPI
- `this.quality` — 'LOSSLESS' | 'HIGH' | 'LOW'
- `this.queue`, `this.shuffledQueue` — track queues
- `this.shuffleActive`, `this.repeatMode` — playback state
- `this.hls` — HLS.js instance
- `this.shakaPlayer` — Shaka Player (DASH)
- `this.radioEnabled`, `this.autoplayEnabled`
- `this.sleepTimer` — sleep timer

**Playback pipeline**: `playTrack(track)` → resolve stream URL → DASH (Shaka) / HLS (HLS.js) / direct → load into `<audio>` → route through `AudioContextManager` → apply ReplayGain → apply EQ → play.

### `LosslessAPI` (`js/api.js`)

Communicates with TIDAL HiFi proxy instances. Key methods:
- `fetchWithRetry(relativePath, options)` — rotates through instances on 429/401
- `searchTracks/Albums/Artists/Playlists/Videos(query, options)` — search
- `getTrack/Album/Artist/Playlist/Mix(id)` — metadata
- `getStreamUrl(trackId, quality)` — resolve playback manifest
- `downloadTrack(track, quality, onProgress)` — download + transcode
- Instance management: loads from uptime checker, supports user-added custom instances

### `MusicDatabase` (`js/db.js`)

IndexedDB wrapper. Database: `MonochromeDB` v12. Stores:

| Store | Key | Purpose |
|-------|-----|---------|
| `favorites_tracks` | `id` | Liked tracks |
| `favorites_videos` | `id` | Liked videos |
| `favorites_albums` | `id` | Liked albums |
| `favorites_artists` | `id` | Liked artists |
| `favorites_playlists` | `uuid` | Liked playlists |
| `favorites_mixes` | `id` | Liked mixes |
| `history_tracks` | `timestamp` | Listening history |
| `user_playlists` | `id` | User-created playlists |
| `user_folders` | `id` | User-created folders |
| `settings` | key (no keyPath) | Misc key-value settings |
| `pinned_items` | `id` | Pinned items (max 3) |

### `MusicAPI` (`js/music-api.js`)

Unified interface over all providers. Provider detection by ID prefix:
- `t:` → TIDAL (LosslessAPI)
- `j:` → JioSaavn
- `yt:` → YouTube Music
- `q:` → Qobuz

Silent API proxy (lines 84-116): when TIDAL proxies fail, silently returns empty results.
Search merges results from JioSaavn + YouTube Music (with dedup), falls back to Tidal.

### `AudioContextManager` (`js/audio-context.js`)

Shared Web Audio context. Audio graph:
```
Source → M/S Splitter (optional) → Parametric EQ (biquad filters) 
  → Graphic EQ → Analyser → Volume → Destination
```
16 built-in EQ presets, binaural DSP, mono mode.

### `Router` (`js/router.js`)

Popstate-based. `navigate(path)` pushes state + dispatches PopStateEvent.
Parses `location.pathname` → calls `ui.render*()`. Supports provider prefix (`/track/t/123` = Tidal).

---

## 5. Data Models (`container-classes.ts`)

### Track
```
id, title, duration, trackNumber, volumeNumber, artist (Artist), artists (Artist[]),
album (TrackAlbum), isrc, copyright, bpm, peak, popularity, explicit, url,
audioQuality, audioModes[], streamStartDate, replayGain, key, keyScale, version,
type, mixes, mediaMetadata, accessType, allowStreaming, adSupportedStreamReady,
premiumStreamingOnly, djReady, stemReady, spotlighted, upload, payToStream
```

### Album
```
Cover, id, title, vibrantColor, videoCover, artist, artists[], type (ALBUM|EP|SINGLE),
numberOfTracks, numberOfVideos, numberOfVolumes, duration, explicit, audioQuality,
audioModes[], copyright, releaseDate, streamStartDate, popularity,
adSupportedStreamReady, allowStreaming, premiumStreamingOnly, djReady, stemReady,
upload, streamReady, url, upc, version, mediaMetadata
```

### Artist
```
id, name, picture, type, handle
```

### PlaybackInfo (extends ReplayGain)
```
trackId, assetPresentation, audioMode, audioQuality, manifestMimeType,
manifestHash, manifest, bitDepth, sampleRate
```

### ReplayGain
```
trackReplayGain, albumReplayGain, trackPeakAmplitude, albumPeakAmplitude
```

---

## 6. API Routes

### TIDAL Proxy (via `LosslessAPI.fetchWithRetry()`)
Base: community-maintained HiFi proxy instances (discovered from uptime checker).

| Endpoint | Method |
|----------|--------|
| `{base}/search/` | Search (all types, with query params for each type) |
| `{base}/search/tracks/{query}` | Search tracks |
| `{base}/search/albums/{query}` | Search albums |
| `{base}/search/artists/{query}` | Search artists |
| `{base}/tracks/{id}` | Get track |
| `{base}/tracks/{id}/stream` | Get stream URL |
| `{base}/tracks/{id}/similar` | Similar tracks |
| `{base}/albums/{id}` | Get album |
| `{base}/artists/{id}` | Get artist |
| `{base}/artists/{id}/tracks/top` | Top tracks |
| `{base}/artists/{id}/similar` | Similar artists |
| `{base}/playlists/{id}` | Get playlist |
| `{base}/mixes/{id}` | Get mix |

### Native TIDAL (`HiFiClient.instance.query()`)
Fans out to `api.tidal.com` and `openapi.tidal.com`.

### JioSaavn API
Base: `https://jiosavan-api2.vercel.app/api/` or `https://saavn.sumit.co/api/`
Endpoints: `/search/tracks/`, `/search/albums/`, `/search/artists/`, `/tracks/`, `/albums/`, `/artists/`, etc.

### YouTube Music API
Base: `/yt-api` (proxied to local `http://127.0.0.1:8787`)
Endpoints: `/search`, `/video/:id`, `/stream/:id`, `/related/:id`, `/play/:id`

### PodcastIndex API
Via `podcasts-api.js`.

---

## 7. CSS & Theming

### File: `styles.css` (12,717 lines)

**Design tokens** (`:root` lines 1-158):
- `--space-0` through `--space-24` (0-6rem spacing scale)
- `--radius-xs` through `--radius-full`
- `--shadow-xs` through `--shadow-2xl`, `--shadow-glow`
- `--z-hide` (-1) through `--z-toast` (1700)
- `--ease-apple`, `--ease-spring`, `--ease-elastic`, etc.
- Glass morphism: `--glass-bg`, `--glass-blur`, `--glass-saturate`

**Built-in themes** (set via `data-theme` attribute on `<html>`):
- `monochrome` (default dark, red accent #fa233b)
- `dark` (blue accent)
- `ocean`, `purple`, `forest`, `mocha`, `machiatto`, `frappe`, `latte`, `white`

Each theme defines ~20 CSS custom properties.

**Layout**: CSS Grid `app-container` with sidebar + main + player rows. Sidebar fixed 210px on desktop, overlay on mobile.

**Key CSS classes**:
- `.card-grid` — Grid layout for card rows (`display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`)
- `.home-card-row` — Horizontal scroll flex row for home page albums/artists (`display: flex; overflow-x: auto; scroll-snap-type: x mandatory`)
- `.card` — Base card component (album, artist, playlist)
- `.track-item` — Single track row in lists
- `.section-title` — Section headers
- `.now-playing-bar` — Fixed bottom player bar with glass background
- `.sidebar` — Left navigation panel

**Responsive breakpoints** (scattered throughout CSS):
- Desktop: `>= 769px` — sidebar visible, grid layout
- Tablet: `768px - 1024px` — collapsed sidebar
- Mobile: `<= 768px`, `<= 480px`, `<= 360px` — overlay sidebar, stacked layouts, smaller cards

**Home card rows** (`.home-card-row` at `styles.css:1882`):
```css
display: flex !important;
gap: 1rem;
overflow-x: auto;
scroll-snap-type: x mandatory;
-webkit-overflow-scrolling: touch;
```
Children: `flex: 0 0 auto; width: clamp(156px, 15vw, 188px); scroll-snap-align: start`

**Mobile-specific home card sizes** (at `styles.css:12698`):
```css
#home-content #home-recommended-albums > *,
.home-card-row > * {
    width: clamp(130px, 40vw, 160px);
}
```

---

## 8. Key UX Patterns

### Card grid vs horizontal scroll
- Album/Artist recommendation rows use `.home-card-row` (flex, horizontal scroll)
- Most other card grids use `.card-grid` (CSS grid)
- The home page albums/artists containers have both `class="card-grid home-card-row"`; `!important` on `.home-card-row` forces flex

### Home page default content
When a user has no listening history (<3 seeds), the home page shows cached default content fetched from API. `fetchAndCacheDefaultContent()` in `ui.js:4347`:
- 8 parallel track queries, 8 album queries, 8 artist queries (via `Promise.allSettled`)
- Deduplicates by ID
- Filters out `SINGLE` album types
- Caches to IndexedDB (`default_home_tracks_v2`, `default_home_albums_v2`, `default_home_artists_v2` keys in settings store)
- Renders into `#home-recommended-songs`, `#home-recommended-albums`, `#home-recommended-artists`

### Search history
Managed by `UIRenderer`, stored in localStorage. Suggestions appear on search focus.

### Multi-provider search
`search(query, options)` in MusicAPI merges from JioSaavn + YouTube Music, falls back to Tidal. Smart interleaving: YouTube first 5, then JioSaavn, then rest of YouTube.

### Streaming quality
User selects via settings: HI_RES_LOSSLESS, LOSSLESS, HIGH, LOW. Applied per-track on stream URL resolution.

### Track selection
Supports Ctrl/Cmd+click (toggle), Shift+click (range), long-press on mobile (500ms).

---

## 9. Important Gotchas

1. **`page_content.html` vs `index.html`**: Both files have near-identical content but `page_content.html` uses inline SVGs instead of `<use>` elements. Some UI elements exist in one but not the other (e.g., `page_content.html` was missing `home-card-row` class on album/artist containers — had to be fixed).

2. **`renderDefaultSongs` calls `renderListWithTracks` without `await`**: This is intentional fire-and-forget, the function is async and the promise is not awaited.

3. **Home page cache keys**: Changed from `default_home_tracks` to `default_home_tracks_v2` to invalidate old cache. If you change the query strategy again, bump the version suffix.

4. **Album type filter**: The `a.type` field can be `'ALBUM'`, `'EP'`, `'SINGLE'`, or `undefined`. Always compare case-insensitively: `(a.type || '').toUpperCase() === 'SINGLE'`.

5. **`!important` usage**: `.home-card-row` uses `display: flex !important` to override `.card-grid`'s `display: grid` since both classes are applied to the same element.

6. **Provider prefix**: IDs with `t:` prefix route to TIDAL, `j:` to JioSaavn, `yt:` to YouTube Music, `q:` to Qobuz. The router extracts these from path segments like `/album/t/123`.

7. **HiFi proxy fallback**: When TIDAL instances fail, `MusicAPI` silently returns empty results (lines 84-116) — no error UI.

8. **Render lock**: `UIRenderer` uses `this.renderLock` boolean to prevent concurrent page renders.

9. **Settings persistence**: All settings stored as individual keys in `localStorage`. Example: `monochrome-theme`, `monochrome-api-instances-v9`, `monochrome-media-session`, etc.

10. **Audio context restriction**: Browsers require user gesture before creating AudioContext. `AudioContextManager` handles this with lazy initialization on first playback.

---

## 10. Testing

- **Framework**: Vitest 4 + Playwright (Chromium)
- **Location**: `js/tests/` directory
- **Key test files**: `db.test.js`, `player.test.js`, `storage.test.js`, `utils.test.js`, `api.test.ts`, `amazon-api.test.js`, `proxy-utils.test.js`, `api-streaming-fallback.test.js`
- **Running**: `npm test` or `npx vitest`

**Known test issues**:
- `api.test.ts` — entire test suite wrapped in `suite.skip` (commented out)
- `amazon-api.test.js` — needs mock to export `losslessContainerSettings`
- `player.test.js` — needs mock to include `getVideoArtwork` method

---

## 11. Build & Deploy

### Commands
| Command | Action |
|---------|--------|
| `npm run dev` | Dev server (Vite) |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run lint` | Lint |
| `npm run format` | Format |
| `npm run server:yt` | Start YouTube API backend |

### Dev proxy (vite.config.ts)
- `/yt-api` → `http://127.0.0.1:8787` (YouTube Music backend)
- `/saavn-api` → `https://jiosavan-api2.vercel.app/api`

### PWA
Service worker with runtime caching for scripts, styles, fonts, images, media. Offline-capable.

### Docker
`docker-compose.yml` for production deployment.

---

## 12. Key Files Quick Reference

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 6707 | Main HTML |
| `styles.css` | 12717 | All CSS |
| `js/ui.js` | 7639 | All page rendering |
| `js/app.js` | 3466 | Entry point + init |
| `js/api.js` | 3558 | TIDAL proxy API |
| `js/storage.js` | 3615 | Settings managers |
| `js/settings.js` | 7340 | Settings UI |
| `js/player.js` | 2924 | Audio playback |
| `js/events.js` | 2709 | Player events |
| `js/audio-context.js` | 1588 | Audio DSP |
| `js/ui-interactions.js` | 718 | Interaction handlers |
| `js/db.js` | 922 | IndexedDB database |
| `js/music-api.js` | 803 | Unified provider API |
| `js/jiosaavn-api.js` | 752 | JioSaavn provider |
| `js/lyrics.js` | 1425 | Lyrics panel |
| `js/downloads.js` | 1188 | Download manager |
| `js/listening-party.js` | 1035 | WebSocket parties |
| `js/accounts/pocketbase.js` | 774 | Backend sync |
| `js/HiFi.ts` | 2658 | Native TIDAL queries |
| `page_content.html` | 8085 | Alternate HTML entry |

---

## 13. Common Tasks & Patterns

### Adding a new home page section
1. Add HTML container in `index.html` & `page_content.html` (section + title + container div)
2. Add render method in `ui.js` (create cards/tracks, append to container)
3. Add to `fetchAndCacheDefaultContent()` if it should show default content
4. Add CSS for layout in `styles.css`

### Changing card layout
- Cards are created by `createBaseCardHTML()` in `ui.js:665`
- Card grid = `.card-grid` (CSS grid), horizontal row = `.home-card-row` (flex)
- Both classes can coexist; `.home-card-row` uses `!important` for display

### Adding a new API provider
1. Create provider class (like `JioSaavnAPI` or `YouTubeMusicAPI`)
2. Add instance to `MusicAPI` constructor
3. Add provider prefix (e.g., `yt:`) to `MusicAPI._getProviderForId()`
4. Implement search, get, stream methods
5. Route provider-specific renders in `UIRenderer`

### Modifying EQ
- DSP: `audio-context.js` — biquad filter chain
- UI presets: `equalizer.js`
- Presets defined in `equalizer-presets.js`
- AutoEQ: `autoeq-engine.js` + `autoeq-data.js`

---

## 14. Environmental Dependencies

- Node.js (for build, YouTube API server)
- yt-dlp binary at `server/bin/yt-dlp` (for YouTube Music audio extraction)
- TIDAL HiFi proxy instances (community-maintained, discovered from uptime checker)
- PocketBase instance (default: `https://data.samidy.xyz`)
- Appwrite instance for auth
- Internet connection for streaming

---

*Generated for LLM context — update this file when project structure changes.*
