# Arostream

A privacy-respecting, open-source music streaming web interface built on YouTube's API. Stream high-fidelity audio without ads or tracking.

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

## Features

### Audio Quality
- High-fidelity audio streaming via YouTube
- Local music file support
- API caching for improved performance

### Interface
- Dark, minimalist design optimized for focus
- Animated album covers for supported releases
- Customizable themes with community theme store
- Built-in audio visualizer
- Offline-capable Progressive Web App (PWA)
- Media Session API integration for system playback controls

### Library and Organization
- Recently Played tracking
- Personal library for favorites
- Queue management with shuffle and repeat modes
- Native podcast support
- Playlist import from external platforms
- Public playlists for sharing
- Smart recommendations for songs, albums, and artists
- Infinite recommendation radio
- Explore page for discovering new and trending music

### Lyrics and Metadata
- Synced lyrics with karaoke mode
- Genius integration
- Track downloads with automatic metadata embedding

### Integrations
- Account system for cross-device syncing
- Customizable public profiles
- Real-time listening parties for synced playback with friends
- Last.fm and ListenBrainz scrobbling
- OAuth support (Google, Discord, GitHub, Spotify)
- Unreleased music from ArtistGrid
- Dynamic Discord embeds
- Artist biographies and social links
- Multiple API instance support with automatic failover

### Power User Features
- Keyboard shortcuts and command palette (Ctrl+K)

---

## Quick Start

### Official Instance

The recommended way to use Arostream is through the official hosted instance:

**[monochrome.tf](https://monochrome.tf)** / **[monochrome.samidy.com](https://monochrome.samidy.com)**

For community-hosted alternatives, see [INSTANCES.md](INSTANCES.md).

---

## Self-Hosting

> Note: Accounts will not work on self-hosted instances. The authentication system is restricted to authorized domains.

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/sahilcodexx/arostream.git
cd arostream/docker
docker compose up -d
```

The application will be available at `http://localhost:3000`.

#### Tailscale Access

To access the instance over Tailscale, the Vite preview server must be configured to allow external hosts:

1. Open `vite.config.js`
2. Uncomment and configure the `preview` section:

```js
preview: {
    host: true,
    allowedHosts: ['<your_tailscale_hostname>'],
},
```

3. Restart the container:

```bash
docker compose down
docker compose up -d
```

For advanced setups and development mode, see [DOCKER.md](DOCKER.md).

### Option 2: Manual Installation

#### Prerequisites

- [Bun](https://bun.sh/) (recommended) or [Node.js](https://nodejs.org/) 20+ / 22+
- [Git](https://git-scm.com/)

#### PocketBase Schema

The PocketBase collection schema is located at [`database/pb_schema.json`](database/pb_schema.json). Import this schema into a fresh PocketBase instance for account data storage.

#### Local Development

```bash
git clone https://github.com/sahilcodexx/arostream.git
cd arostream
bun install
bun run dev
```

Navigate to `http://localhost:5173/`.

#### Production Build

```bash
bun run build
```

---

## Usage

Search for artists, albums, or tracks and start playback. Use the media controls to manage the queue, volume, and playback state.

### Keyboard Shortcuts

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `Space`       | Play / Pause              |
| `Right`       | Seek forward 10s          |
| `Left`        | Seek backward 10s         |
| `Shift+Right` | Next track                |
| `Shift+Left`  | Previous track            |
| `Up`          | Volume up                 |
| `Down`        | Volume down               |
| `M`           | Mute / Unmute             |
| `S`           | Toggle shuffle            |
| `R`           | Toggle repeat             |
| `Q`           | Open queue                |
| `L`           | Toggle lyrics             |
| `/`           | Focus search              |
| `Esc`         | Close modals              |
| `[` / `]`     | Previous / Next visualizer|
| `\`           | Toggle visualizer cycling |
| `Ctrl+K`      | Command palette           |

### Account Features

To sync your library, history, and playlists across devices:

1. Navigate to the Accounts section
2. Sign in with Google, Discord, GitHub, Spotify, or email
3. Your data will sync automatically across devices

---

## Contributing

Contributions are welcome. See the [Contributing Guide](CONTRIBUTING.md) for setup instructions, code style guidelines, and project structure.

---

<p align="center">
  <a href="https://notbyai.fyi">
    <img src="https://i.samidy.xyz/Developed-By-Humans-Not-By-AI-Badge-black%402x.png" alt="Developed by Humans" height="50">
  </a>
</p>
