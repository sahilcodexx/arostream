const API_BASE = import.meta.env.VITE_YOUTUBE_API_URL || '/yt-api';

const FETCH_TIMEOUT = 12000;

function extractVideoId(urlOrId) {
    if (!urlOrId) return null;
    const raw = String(urlOrId).replace(/^yt:/, '');
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    const match = raw.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

async function fetchBackend(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Backend error ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error('YouTube backend timeout — is server running?');
        throw err;
    }
}

export class YouTubeMusicAPI {
    constructor() {
        this.streamUrlCache = new Map();
        this.trackCache = new Map();
    }

    async searchTracks(query, options = {}) {
        try {
            const limit = options.limit || 20;
            const data = await fetchBackend(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            return { items: data.items || [], total: data.total || 0 };
        } catch (err) {
            console.warn('YouTube search failed (start backend: npm run server:yt):', err.message);
            return { items: [], total: 0 };
        }
    }

    async getRelatedTracks(id, limit = 20) {
        const videoId = extractVideoId(id);
        if (!videoId) return { items: [], total: 0 };

        try {
            const data = await fetchBackend(`/related/${videoId}?limit=${limit}`);
            return { items: data.items || [], total: data.total || 0 };
        } catch (err) {
            console.warn('YouTube getRelatedTracks failed:', err.message);
            return { items: [], total: 0 };
        }
    }

    async getTrack(id) {
        const videoId = extractVideoId(id);
        if (!videoId) return null;

        if (this.trackCache.has(videoId)) {
            return this.trackCache.get(videoId);
        }

        try {
            const track = await fetchBackend(`/video/${videoId}`);
            this.trackCache.set(videoId, track);
            return track;
        } catch (err) {
            console.warn('YouTube getTrack failed:', err.message);
            return null;
        }
    }

    async getStreamUrl(id) {
        const videoId = extractVideoId(id);
        if (!videoId) {
            return { url: null, provider: 'youtube', playbackType: 'direct', error: 'no id' };
        }

        return {
            url: `${API_BASE}/play/${videoId}`,
            provider: 'youtube',
            playbackType: 'direct',
            mimeType: 'audio/webm',
        };
    }

    getCoverUrl(id) {
        const videoId = extractVideoId(id);
        if (!videoId) return null;
        if (typeof id === 'string' && (id.startsWith('http') || id.startsWith('blob:'))) return id;
        return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    }
}