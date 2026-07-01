// js/music-api.js

import { LosslessAPI } from './api.js';
import { PodcastsAPI } from './podcasts-api.js';
import { JioSaavnAPI, enhanceCoverUrl, artistNameMatches } from './jiosaavn-api.js';
import { YouTubeMusicAPI } from './youtube-music-api.js';
import { musicProviderSettings } from './storage.js';

/**
 * MusicAPI - Singleton class that provides a unified interface for accessing music streaming services.
 *
 * Supports multiple providers (primarily Tidal) and includes functionality for searching,
 * retrieving metadata, streaming, and managing playlists, artists, albums, tracks, and podcasts.
 *
 * @class MusicAPI
 * @classdesc Manages API interactions with music providers and provides caching mechanisms
 * for cover artwork and video metadata.
 *
 * @example
 * // Initialize the MusicAPI
 * await MusicAPI.initialize(settings);
 *
 * // Get the singleton instance
 * const api = MusicAPI.instance;
 *
 * // Search for tracks
 * const results = await api.search('query');
 *
 * // Get a specific track
 * const track = await api.getTrack('track-id');
 *
 * // Get stream URL
 * const streamUrl = await api.getStreamUrl('track-id', 'HIGH');
 *
 * @property {LosslessAPI} tidalAPI - The Tidal API instance
 * @property {PodcastsAPI} podcastsAPI - The Podcasts API instance
 * @property {Object} _settings - Configuration settings
 * @property {Map} videoArtworkCache - Cache for video artwork data
 *
 * @throws {Error} Throws if instance is accessed before initialization
 * @throws {Error} Throws if initialize is called more than once
 */
export class MusicAPI {
    static #instance = null;
    /**
     * @type {MusicAPI}
     */
    static get instance() {
        if (!MusicAPI.#instance) {
            throw new Error('MusicAPI not initialized. Call MusicAPI.initialize(settings) first.');
        }
        return MusicAPI.#instance;
    }

    /** @private */
    constructor(settings) {
        this.tidalAPI = new LosslessAPI(settings);
        this.podcastsAPI = new PodcastsAPI();
        this.jiosaavnAPI = new JioSaavnAPI();
        this.youtubeAPI = new YouTubeMusicAPI();
        this._settings = settings;
        this.videoArtworkCache = new Map();
        this.setSilentAPI(true);
    }

    static async initialize(settings) {
        if (MusicAPI.#instance) {
            throw new Error('MusicAPI is already initialized');
        }

        const api = new MusicAPI(settings);
        return (MusicAPI.#instance = api);
    }

    getCurrentProvider() {
        return musicProviderSettings.getProvider();
    }

    // Get the appropriate API based on provider
    getAPI() {
        return this._silentAPI || this.tidalAPI;
    }

    /** Silently return empty results for all API calls (Tidal proxies are dead) */
    setSilentAPI(enabled) {
        if (enabled && !this._silentAPI) {
            const handler = {
                get: (target, prop) => {
                    if (typeof target[prop] === 'function') {
                        return async (...args) => {
                            const name = String(prop);
                            if (name.startsWith('search'))
                                return {
                                    items: [],
                                    total: 0,
                                    albums: { items: [] },
                                    artists: { items: [] },
                                    playlists: { items: [] },
                                    videos: { items: [] },
                                };
                            if (name.includes('Similar')) return [];
                            if (name.includes('Recommendation') || name.includes('TopTracks'))
                                return { items: [], total: 0 };
                            if (name.startsWith('get')) return null;
                            if (name === 'enrichTracksWithAlbumDates') return [];
                            return target[prop](...args);
                        };
                    }
                    return target[prop];
                },
            };
            this._silentAPI = new Proxy(this.tidalAPI, handler);
        } else if (!enabled) {
            this._silentAPI = null;
        }
    }

    _normalizeTrackTitle(title = '') {
        return String(title)
            .toLowerCase()
            .replace(/\(.*?\)|\[.*?\]/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _mergeSearchTracks(jioTracks, ytTracks, options = {}) {
        const ytPriority = options.youtubePriorityCount ?? 5;
        const maxTotal = options.limit ?? 25;
        const seen = new Set();
        const merged = [];

        const addTrack = (track) => {
            const key = this._normalizeTrackTitle(track.title);
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(track);
        };

        for (const track of (ytTracks.items || []).slice(0, ytPriority)) {
            addTrack(track);
        }
        for (const track of jioTracks.items || []) {
            addTrack(track);
        }
        for (const track of (ytTracks.items || []).slice(ytPriority)) {
            addTrack(track);
        }

        const items = merged.slice(0, maxTotal);
        return { items, total: items.length };
    }

    async _mergeYouTubeTracks(jioTracks, query, options = {}) {
        const ytLimit = options.youtubeLimit ?? 15;
        const ytTracks = await this.youtubeAPI.searchTracks(query, { ...options, limit: ytLimit });
        if (!ytTracks.items.length) return jioTracks;
        if (!jioTracks.items.length) return ytTracks;

        return this._mergeSearchTracks(jioTracks, ytTracks, options);
    }

    _extractArtistsFromTracks(tracks, artistMap = new Map()) {
        for (const track of tracks) {
            if (track.artist?.id && !artistMap.has(track.artist.id)) {
                artistMap.set(track.artist.id, {
                    ...track.artist,
                    picture:
                        track.artist.picture ||
                        track.artist.image ||
                        track.artist.cover ||
                        track.album?.cover ||
                        track.cover,
                    image:
                        track.artist.image ||
                        track.artist.picture ||
                        track.artist.cover ||
                        track.album?.cover ||
                        track.cover,
                    cover:
                        track.artist.cover ||
                        track.artist.picture ||
                        track.artist.image ||
                        track.album?.cover ||
                        track.cover,
                });
            }
            for (const artist of track.artists || []) {
                if (artist?.id && !artistMap.has(artist.id)) {
                    artistMap.set(artist.id, {
                        ...artist,
                        picture: artist.picture || artist.image || artist.cover || track.album?.cover || track.cover,
                        image: artist.image || artist.picture || artist.cover || track.album?.cover || track.cover,
                        cover: artist.cover || artist.picture || artist.image || track.album?.cover || track.cover,
                    });
                }
            }
        }
        return artistMap;
    }

    async _searchYouTubeArtists(query, limit = 10) {
        const artists = [];
        const seen = new Set();

        for (const ytQuery of [query, `${query} ghazal`]) {
            const ytTracks = await this.youtubeAPI.searchTracks(ytQuery, { limit: 12 }).catch(() => ({
                items: [],
            }));
            for (const track of ytTracks.items) {
                const name = track.artist?.name || track.artists?.[0]?.name;
                if (!name) continue;
                const key = name.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                artists.push({
                    id: track.artist?.id || `yt:artist_${key.replace(/\s+/g, '_')}`,
                    name,
                    picture: track.album?.cover || track.cover,
                    cover: track.album?.cover || track.cover,
                    image: track.album?.cover || track.cover,
                    type: 'artist',
                    isYouTube: true,
                });
                if (artists.length >= limit) return artists;
            }
        }
        return artists;
    }

    // Search methods
    async search(query, options = {}) {
        const ytLimit = options.youtubeLimit ?? 15;
        const empty = { items: [], total: 0 };

        const [jioTracks, ytTracks] = await Promise.all([
            this.jiosaavnAPI.searchTracks(query, options).catch(() => empty),
            this.youtubeAPI.searchTracks(query, { ...options, limit: ytLimit }).catch(() => empty),
        ]);

        let tracks = empty;
        if (jioTracks.items.length > 0 && ytTracks.items.length > 0) {
            tracks = this._mergeSearchTracks(jioTracks, ytTracks, options);
        } else if (jioTracks.items.length > 0) {
            tracks = jioTracks;
        } else if (ytTracks.items.length > 0) {
            tracks = ytTracks;
        }

        const [jioAlbums, ytArtists] = await Promise.all([
            this.jiosaavnAPI.searchAlbums(query, options).catch(() => empty),
            this._searchYouTubeArtists(query).catch(() => []),
        ]);

        const artistMap = this._extractArtistsFromTracks(tracks.items);
        for (const artist of ytArtists) artistMap.set(artist.id, artist);
        const artists = { items: [...artistMap.values()], total: artistMap.size };

        if (tracks.items.length > 0 || artists.items.length > 0 || jioAlbums.items.length > 0) {
            return {
                tracks,
                videos: { items: [] },
                artists,
                albums: jioAlbums,
                playlists: { items: [] },
            };
        }

        const tidalData = await this.getAPI()
            .search(query, options)
            .catch(() => null);
        if (tidalData?.tracks?.items?.length) return tidalData;

        return {
            tracks: empty,
            videos: { items: [] },
            artists: empty,
            albums: empty,
            playlists: { items: [] },
        };
    }

    async searchTracks(query, options = {}) {
        const ytLimit = options.youtubeLimit ?? 15;
        const empty = { items: [], total: 0 };
        const [jioResult, ytResult] = await Promise.all([
            this.jiosaavnAPI.searchTracks(query, options).catch(() => empty),
            this.youtubeAPI.searchTracks(query, { ...options, limit: ytLimit }).catch(() => empty),
        ]);

        if (jioResult.items.length > 0 && ytResult.items.length > 0) {
            return this._mergeSearchTracks(jioResult, ytResult, options);
        }
        if (jioResult.items.length > 0) return jioResult;
        if (ytResult.items.length > 0) return ytResult;

        return this.getAPI().searchTracks(query, options);
    }

    async searchArtists(query, options = {}) {
        const empty = { items: [], total: 0 };
        const [jioResult, ytArtists] = await Promise.all([
            this.jiosaavnAPI.searchArtists(query, options).catch(() => empty),
            this._searchYouTubeArtists(query).catch(() => []),
        ]);

        const artistMap = new Map();
        for (const artist of jioResult.items) artistMap.set(artist.id, artist);
        for (const artist of ytArtists) artistMap.set(artist.id, artist);

        const items = [...artistMap.values()];
        if (items.length) return { items, total: items.length };
        return this.getAPI().searchArtists(query, options);
    }

    async searchAlbums(query, options = {}) {
        const jioResult = await this.jiosaavnAPI.searchAlbums(query, options);
        if (jioResult.items.length > 0) return jioResult;
        return this.getAPI().searchAlbums(query, options);
    }

    async searchPlaylists(query, options = {}) {
        try {
            return await this.getAPI().searchPlaylists(query, options);
        } catch {
            return { items: [], total: 0 };
        }
    }

    async searchVideos(query, options = {}) {
        try {
            return await this.getAPI().searchVideos(query, options);
        } catch {
            return { items: [], total: 0 };
        }
    }

    async searchPodcasts(query, options = {}) {
        return this.podcastsAPI.searchPodcasts(query, options);
    }

    async getPodcast(id, options = {}) {
        return this.podcastsAPI.getPodcastById(id, options);
    }

    async getPodcastEpisodes(id, options = {}) {
        return this.podcastsAPI.getPodcastEpisodes(id, options);
    }

    async getTrendingPodcasts(options = {}) {
        return this.podcastsAPI.getTrendingPodcasts(options);
    }

    // Get methods
    async getTrack(id, quality) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            return this.jiosaavnAPI.getTrack(id, quality);
        }
        if (typeof id === 'string' && id.startsWith('yt:')) {
            return this.youtubeAPI.getTrack(id);
        }
        return { track: null };
    }

    async getTrackMetadata(id) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            const track = await this.jiosaavnAPI.getTrack(id);
            return track;
        }
        if (typeof id === 'string' && id.startsWith('yt:')) {
            return this.youtubeAPI.getTrack(id);
        }
        return null;
    }

    async getAlbum(id) {
        if (typeof id === 'string' && (id.startsWith('j:album_') || id.startsWith('j:'))) {
            return this.jiosaavnAPI.getAlbum(id);
        }
        return { album: null, tracks: [] };
    }

    async getArtist(id) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            return this.jiosaavnAPI.getArtist(id);
        }
        return null;
    }

    async getArtistBiography(id) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            return this.jiosaavnAPI.getArtistBiography(id);
        }
        return null;
    }

    async getVideo(id) {
        return null;
    }

    async getVideoStreamUrl(id) {
        return null;
    }

    async getArtistSocials(artistName) {
        return null;
    }

    async getPlaylist(id, _provider = null) {
        if (typeof id === 'string' && id.startsWith('j:')) return null;
        return { tracks: [], playlist: null };
    }

    async getMix(id) {
        if (typeof id === 'string' && id.startsWith('j:')) return null;
        return null;
    }

    async getTrackRecommendations(id) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            return this.jiosaavnAPI.getTrackRecommendations(id);
        }
        if (typeof id === 'string' && id.startsWith('yt:')) {
            const track = await this.youtubeAPI.getTrack(id);
            if (!track?.artist?.name) return [];
            const result = await this.jiosaavnAPI.searchTracks(track.artist.name, { limit: 15 });
            return result.items.slice(0, 20);
        }
        return [];
    }

    // Stream methods
    async getStreamUrl(id, quality) {
        if (typeof id === 'string' && id.startsWith('j:')) {
            return this.jiosaavnAPI.getStreamUrl(id, quality);
        }
        if (typeof id === 'string' && id.startsWith('yt:')) {
            return this.youtubeAPI.getStreamUrl(id);
        }
        return { url: null, error: 'Tidal services removed' };
    }

    // Cover/artwork methods
    getCoverUrl(id, size = '320') {
        if (!id) return '';
        if (typeof id === 'string' && (id.startsWith('blob:') || id.startsWith('http'))) {
            return enhanceCoverUrl(id);
        }
        if (typeof id !== 'string') return '';
        if (id.startsWith('j:')) {
            return this.jiosaavnAPI.getCoverUrl(id, size);
        }
        if (id.startsWith('yt:')) {
            return this.youtubeAPI.getCoverUrl(id, size);
        }
        return this.tidalAPI.getCoverUrl(this.stripProviderPrefix(id), size);
    }

    getCoverSrcset(id) {
        if (!id) return '';
        if (typeof id === 'string' && (id.startsWith('blob:') || id.startsWith('http'))) {
            return enhanceCoverUrl(id);
        }
        if (typeof id !== 'string') return '';
        if (id.startsWith('j:')) {
            return this.jiosaavnAPI.getCoverUrl(id);
        }
        if (id.startsWith('yt:')) {
            return this.youtubeAPI.getCoverUrl(id);
        }
        return this.tidalAPI.getCoverSrcset(this.stripProviderPrefix(id));
    }

    getVideoCoverUrl(imageId, size = '1280') {
        if (!imageId) {
            return null;
        }
        if (typeof imageId === 'string' && (imageId.startsWith('blob:') || imageId.startsWith('http'))) {
            return imageId;
        }
        if (typeof imageId !== 'string') return null;
        return this.tidalAPI.getVideoCoverUrl(this.stripProviderPrefix(imageId), size);
    }

    async getVideoArtwork(title, artist) {
        const cacheKey = `${title}-${artist}`.toLowerCase();
        if (this.videoArtworkCache.has(cacheKey)) {
            return this.videoArtworkCache.get(cacheKey);
        }
        // artwork.boidu.dev developer asked us to disable his API for the time being due to rate limits.
        /* 
        try {
            const url = `https://artwork.boidu.dev/?s=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            const result = {
                videoUrl: data.videoUrl || null,
                hlsUrl: data.animated || null,
            };
            this.videoArtworkCache.set(cacheKey, result);
            return result;
        
        } catch (error) {
            console.warn('Failed to fetch video artwork:', error);
            return null;
        }
        */
    }

    getArtistPictureUrl(id, size = '320') {
        if (!id) return '';
        if (typeof id === 'string' && (id.startsWith('blob:') || id.startsWith('http'))) {
            return enhanceCoverUrl(id);
        }
        if (typeof id !== 'string') return '';
        if (id.startsWith('j:')) {
            return this.jiosaavnAPI.getArtistPictureUrl(id, size);
        }
        return this.tidalAPI.getArtistPictureUrl(this.stripProviderPrefix(id), size);
    }

    getArtistPictureSrcset(id) {
        if (!id || (typeof id === 'string' && (id.startsWith('blob:') || id.startsWith('http')))) {
            return '';
        }
        if (typeof id !== 'string') return '';
        if (id.startsWith('j:')) {
            return this.jiosaavnAPI.getArtistPictureUrl(id);
        }
        return this.tidalAPI.getArtistPictureSrcset(this.stripProviderPrefix(id));
    }

    async getArtistBanner(artistName) {
        const cacheKey = `banner-${artistName}`.toLowerCase();
        if (this.videoArtworkCache.has(cacheKey)) {
            return this.videoArtworkCache.get(cacheKey);
        }

        try {
            const url = `https://artwork-boidu-dev.samidy.workers.dev/artist?a=${encodeURIComponent(artistName)}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();

            let hlsUrl = null;
            if (data.animated) {
                if (typeof data.animated === 'string') {
                    hlsUrl = data.animated;
                } else if (typeof data.animated === 'object') {
                    hlsUrl = data.animated.hls || data.animated.url || data.animated.hlsUrl || data.animated.videoUrl;

                    if (!hlsUrl) {
                        for (const key in data.animated) {
                            if (typeof data.animated[key] === 'string' && data.animated[key].includes('.m3u8')) {
                                hlsUrl = data.animated[key];
                                break;
                            }
                        }
                    }
                }
            }

            const result = {
                hlsUrl: hlsUrl,
            };
            this.videoArtworkCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn('Failed to fetch artist banner:', error);
            return null;
        }
    }

    extractStreamUrlFromManifest(manifest) {
        return this.tidalAPI.extractStreamUrlFromManifest(manifest);
    }

    // Helper methods
    getProviderFromId(id) {
        if (typeof id === 'string') {
            if (id.startsWith('t:')) return 'tidal';
            if (id.startsWith('j:')) return 'jiosaavn';
            if (id.startsWith('yt:')) return 'youtube';
        }
        return null;
    }

    stripProviderPrefix(id) {
        if (typeof id === 'string') {
            if (id.startsWith('q:') || id.startsWith('t:')) {
                return id.slice(2);
            }
        }
        return id;
    }

    // Download methods
    async downloadTrack(id, quality, filename, options = {}) {
        if (typeof id === 'string' && (id.startsWith('j:') || id.startsWith('yt:'))) {
            const streamInfo = id.startsWith('j:')
                ? await this.jiosaavnAPI.getStreamUrl(id, quality)
                : await this.youtubeAPI.getStreamUrl(id);
            const streamUrl = streamInfo?.url || streamInfo;
            if (!streamUrl) return { error: 'No stream URL available' };
            try {
                const response = await fetch(streamUrl);
                if (!response.ok) return { error: `Download failed: ${response.status}` };
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || `${id}.mp3`;
                a.click();
                URL.revokeObjectURL(url);
                return { success: true };
            } catch (err) {
                return { error: err.message };
            }
        }
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.downloadTrack(cleanId, quality, filename, options);
    }

    // Similar/recommendation methods
    async getSimilarArtists(artistId) {
        if (typeof artistId === 'string' && artistId.startsWith('j:')) {
            return this.jiosaavnAPI.getSimilarArtists(artistId);
        }
        return [];
    }

    async getArtistTopTracks(artistId, options = {}) {
        if (typeof artistId === 'string' && artistId.startsWith('j:')) {
            return this.jiosaavnAPI.getArtistTopTracks(artistId, options);
        }
        return { items: [] };
    }

    async getSimilarAlbums(albumId) {
        if (typeof albumId === 'string' && albumId.startsWith('j:')) {
            return this.jiosaavnAPI.getSimilarAlbums(albumId);
        }
        return [];
    }

    async resolveArtistByName(name) {
        return this.jiosaavnAPI.resolveArtistByName(name);
    }

    async getAlbumsForArtistName(name, limit = 12) {
        return this.jiosaavnAPI.getAlbumsForArtistName(name, limit);
    }

    async getRelatedArtistsForName(name) {
        const resolved = await this.resolveArtistByName(name);
        if (resolved?.id?.startsWith('j:')) {
            const similar = await this.getSimilarArtists(resolved.id);
            if (similar.length) return similar;
        }

        const coArtists = await this.jiosaavnAPI.getCoArtistsFromSongs(name, resolved?.id);
        if (coArtists.length) return coArtists;

        const seen = new Set([name.toLowerCase()]);
        const ytArtists = [];

        const addYtArtist = (track) => {
            const artist = track.artist?.name || track.artists?.[0]?.name;
            if (!artist) return;
            const key = artist.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            ytArtists.push({
                id: track.artist?.id || `yt:artist_${key.replace(/\s+/g, '_')}`,
                name: artist,
                picture: track.album?.cover || track.cover,
                cover: track.album?.cover || track.cover,
                image: track.album?.cover || track.cover,
                type: 'artist',
                isYouTube: true,
            });
        };

        const seedGhazals = await this.youtubeAPI.searchTracks(`${name} ghazal`, { limit: 10 });
        for (const track of seedGhazals.items) {
            if (!artistNameMatches(track, name)) continue;
            for (const performer of track.artists || (track.artist ? [track.artist] : [])) {
                if (!performer?.name || artistNameMatches({ artist: performer }, name)) continue;
                addYtArtist({ ...track, artist: performer, artists: [performer] });
                if (ytArtists.length >= 8) return ytArtists;
            }
        }

        const ghazalMix = await this.youtubeAPI.searchTracks('ghazal', { limit: 20 });
        for (const track of ghazalMix.items) {
            if (artistNameMatches(track, name)) continue;
            addYtArtist(track);
            if (ytArtists.length >= 8) return ytArtists;
        }

        return ytArtists;
    }

    async getRecommendedTracksForPlaylist(tracks, limit = 20, options = {}) {
        if (!tracks?.length) return [];

        const normalized = tracks.map((t) => (typeof t === 'string' ? { id: t } : t));
        const hasJio = normalized.some((t) => t.id?.startsWith?.('j:'));
        const hasYt = normalized.some((t) => t.id?.startsWith?.('yt:'));

        const recommended = [];
        const seen = new Set(normalized.map((t) => t.id));

        const isGarbageTrack = (track) => {
            const title = String(track?.title || '')
                .trim()
                .toLowerCase();
            const artist = String(track?.artist?.name || track?.artists?.[0]?.name || '')
                .trim()
                .toLowerCase();
            return !track?.id || title === 'topic' || artist === 'topic';
        };

        const addTrack = (track) => {
            if (!track?.id || seen.has(track.id) || isGarbageTrack(track)) return;
            if (options.knownTrackIds?.has(track.id)) return;
            seen.add(track.id);
            recommended.push(track);
        };

        if (hasYt) {
            const ytSeeds = normalized.filter((t) => t.id?.startsWith?.('yt:'));

            for (const seed of ytSeeds.slice(0, 3)) {
                if (recommended.length >= limit) break;
                const related = await this.youtubeAPI.getRelatedTracks(seed.id, limit);
                for (const item of related.items || []) {
                    addTrack(item);
                    if (recommended.length >= limit) break;
                }
            }

            if (recommended.length < limit) {
                for (const seed of ytSeeds.slice(0, 3)) {
                    if (recommended.length >= limit) break;
                    const artistName = seed.artist?.name || seed.artists?.[0]?.name;
                    if (!artistName || artistName === 'Unknown Artist') continue;

                    const ytResult = await this.youtubeAPI.searchTracks(artistName, { limit: 15 });
                    for (const item of ytResult.items) {
                        if (artistNameMatches(item, artistName)) addTrack(item);
                        if (recommended.length >= limit) break;
                    }
                }
            }

            if (recommended.length) return recommended.slice(0, limit);
        }

        if (hasJio) {
            for (const seed of normalized.slice(0, 8)) {
                if (recommended.length >= limit) break;

                if (seed.id?.startsWith('j:')) {
                    const trackRecs = await this.jiosaavnAPI.getTrackRecommendations(seed.id);
                    for (const item of trackRecs) addTrack(item);
                }

                const artistName = seed.artist?.name || seed.artists?.[0]?.name;
                if (artistName) {
                    const jioRecs = await this.jiosaavnAPI.getRecommendedTracksForPlaylist(
                        [{ artist: { name: artistName } }],
                        Math.max(5, limit - recommended.length),
                        options
                    );
                    for (const item of jioRecs) addTrack(item);
                }
            }

            if (recommended.length) return recommended.slice(0, limit);
        }

        return [];
    }

    // Cache methods
    async clearCache() {
        await this.tidalAPI.clearCache();
    }

    getCacheStats() {
        return this.tidalAPI.getCacheStats();
    }

    // Settings accessor for compatibility
    get settings() {
        return this._settings;
    }
}

export const musicAPI = new MusicAPI();
