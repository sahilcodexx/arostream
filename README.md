<p align="center">
  <a href="https://monochrome.tf">
    <img src="https://github.com/monochrome-music/monochrome/blob/main/public/assets/512.png?raw=true" alt="Arostream Logo" width="150px">
  </a>
</p>

<h1 align="center">Arostream</h1>

<p align="center">
  <strong>Stream and download millions of Hi-Res FLACs, unreleased songs and music videos, all for free.</strong>
</p>

<p align="center">
  <a href="https://github.com/sahilcodexx/arostream#features">Features</a> -
  <a href="https://github.com/sahilcodexx/arostream#usage">Usage</a> -
  <a href="https://github.com/sahilcodexx/arostream#self-hosting">Self-Hosting</a> -
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/sahilcodexx/arostream/stargazers">
    <img src="https://img.shields.io/github/stars/sahilcodexx/arostream?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub stars">
  </a>
  <a href="https://github.com/sahilcodexx/arostream/forks">
    <img src="https://img.shields.io/github/forks/sahilcodexx/arostream?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub forks">
  </a>
  <a href="https://github.com/sahilcodexx/arostream/issues">
    <img src="https://img.shields.io/github/issues/sahilcodexx/arostream?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub issues">
  </a>
</p>

---

## What is Arostream?

**Arostream** is an open-source, privacy-respecting, ad-free music streaming web UI, built on top of YouTube's API. It provides a beautiful, minimalist interface for streaming high-quality music without the clutter of traditional streaming platforms.

---

## Features

### Audio Quality
- High-quality audio streaming via YouTube
- Support for local music files
- API caching for improved performance

### Interface
- Dark, minimalist interface optimized for focus
- Animated Album Covers For Supported Albums
- Customizable themes & Community Theme Store
- Accurate and unique audio visualizer
- Offline-capable Progressive Web App (PWA)
- Media Session API integration for system controls

### Library & Organization
- Recently Played tracking for easy history access
- Comprehensive Personal Library for favorites
- Queue management with shuffle and repeat modes
- Native Podcast support & organization
- Playlist import from other platforms
- Public playlists for social sharing
- Smart recommendations for new songs, albums & artists
- Infinite Recommendation Radio
- Explore Page (Hot & New) for discovering newly added music and whats trending overall or within each genre

### Lyrics & Metadata
- Lyrics support with karaoke mode
- Genius integration for lyrics
- Track downloads with automatic metadata embedding

### Integrations
- Account system for cross-device syncing
- Customizable & Public Profiles
- Real-time Listening Parties for synced playback with friends
- Last.fm and ListenBrainz integration for scrobbling
- OAuth support (Google, Discord, GitHub, Spotify)
- Unreleased music from [ArtistGrid](https://artistgrid.cx)
- Dynamic Discord Embeds
- Artist Biography + Social Links for learning more about your favorite artists
- Multiple API instance support with failover

### Power User Features
- Keyboard shortcuts & Command Palette (CTRL+K) for power users

---

## Quick Start

### Live Instance

Our Recommended way to use Arostream is through our official instance:

**[monochrome.tf](https://monochrome.tf)** / **[monochrome.samidy.com](https://monochrome.samidy.com)**

For alternative instances, check [INSTANCES.md](INSTANCES.md).

---

## Self-Hosting

NOTE: Accounts will not work on self-hosted instances. Our Appwrite authentication system only allows authorized domains.

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/sahilcodexx/arostream.git
cd arostream/docker
docker compose up -d
```

Visit `http://localhost:3000`

### Tailscale Access

Visit `http://<tailscale_server_hostname_or_ip>:3000`

By default, the app uses Vite preview, which restricts access to localhost.  
To allow access over Tailscale:

1. Open `vite.config.js`
2. Uncomment and configure the `preview` section:

```js
preview: {
    host: true,
    allowedHosts: ['<your_tailscale_hostname>'], // e.g. pi5.tailf5f622.ts.net
},
```

3. Restart with a fresh container (if already running):

```bash
docker compose down
docker compose up -d
```

For development mode and advanced setups, see [DOCKER.md](DOCKER.md).

### Option 2: Manual Installation

#### Prerequisites
- [Bun](https://bun.sh/) (Preferred) or [Node.js](https://nodejs.org/) (Version 20+ or 22+ recommended)
- [Git](https://git-scm.com/)

#### PocketBase Schema
The current PocketBase collection schema is stored in [`database/pb_schema.json`](database/pb_schema.json). Import this schema into a fresh PocketBase instance when setting up account data storage.

#### Local Development

1. **Clone the repository:**

    ```bash
    git clone https://github.com/sahilcodexx/arostream.git
    cd arostream
    ```

2. **Install dependencies:**

    ```bash
    bun install
    # or
    npm install
    ```

3. **Start the development server:**

    ```bash
    bun run dev
    # or
    npm run dev
    ```

4. **Open your browser:**
   Navigate to `http://localhost:5173/`

#### Building for Production

```bash
bun run build
# or
npm run build
```

---

## Usage

### Basic Usage
1. Visit the website or your local development server
2. Search for your favorite artists, albums, or tracks
3. Click play to start streaming
4. Use the media controls to manage playback, queue, and volume

### Keyboard Shortcuts

| Shortcut      | Action                       |
| ------------- | ---------------------------- |
| `Space`       | Play / Pause                 |
| `→`           | Seek forward 10s             |
| `←`           | Seek backward 10s            |
| `Shift` + `→` | Next track                   |
| `Shift` + `←` | Previous track               |
| `↑`           | Volume up                    |
| `↓`           | Volume down                  |
| `M`           | Mute / Unmute                |
| `S`           | Toggle shuffle               |
| `R`           | Toggle repeat                |
| `Q`           | Open queue                   |
| `L`           | Toggle lyrics                |
| `/`           | Focus search                 |
| `Esc`         | Close modals                 |
| `[`           | Previous visualizer preset   |
| `]`           | Next visualizer preset       |
| `\`           | Toggle visualizer auto-cycle |
| `Ctrl` + `K`  | Command Palette              |

### Account Features
To sync your library, history, and playlists across devices:
1. Click the "Accounts" Section
2. Sign in with Google or Email
3. Your data will automatically sync across all devices

---

## Contributing

We welcome contributions from the community! Please see our [Contributing Guide](CONTRIBUTING.md) for:
- Setting up your development environment
- Code style and linting
- Project structure
- Before You Contribute
- Commit message conventions
- Deployment information

---

<p align="center">
  <a href="https://notbyai.fyi">
    <img src="https://i.samidy.xyz/Developed-By-Humans-Not-By-AI-Badge-black%402x.png" alt="Developed by Humans" height="50">
  </a>
</p>
