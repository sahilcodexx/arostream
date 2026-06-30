function getApiBaseUrls() {
    const remote = ['https://jiosavan-api2.vercel.app/api/', 'https://saavn.sumit.co/api/'];
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return ['/saavn-api/', ...remote];
        }
    }
    return remote;
}

const FETCH_TIMEOUT = 12000;

const QUALITY_PRIORITY = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
const IMAGE_QUALITY_PRIORITY = ['500x500', '150x150', '50x50'];

export function enhanceCoverUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('i.ytimg.com/vi/')) {
        return url.replace(/\/(hqdefault|mqdefault|sddefault|default)(\.[a-z]+)?$/i, '/maxresdefault.jpg');
    }
    if (url.includes('saavncdn.com')) {
        return url
            .replace(/-50x50\./, '-500x500.')
            .replace(/-150x150\./, '-500x500.');
    }
    return url;
}

function getBestQualityUrl(qualityList, priority) {
    if (!qualityList || !qualityList.length) return null;
    if (typeof qualityList === 'string') return enhanceCoverUrl(qualityList);
    for (const target of priority) {
        const found = qualityList.find((q) => q.quality === target);
        if (found) return enhanceCoverUrl(found.url || found.link);
    }
    return enhanceCoverUrl(qualityList[0]?.url || qualityList[0]?.link || null);
}

function stripJioArtistId(id) {
    return String(id || '').replace(/^j:artist_/, '').replace(/^j:/, '');
}

function stripJioAlbumId(id) {
    return String(id || '').replace(/^j:album_/, '').replace(/^j:/, '');
}

function stripJioTrackId(id) {
    return String(id || '').replace(/^j:/, '');
}

function normalizeName(name = '') {
    return String(name)
        .replace(/\u00a0/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function artistNameMatches(track, targetName) {
    const targetWords = normalizeName(targetName).split(' ').filter(Boolean);
    if (!targetWords.length) return false;

    const names = [track.artist?.name, ...(track.artists || []).map((a) => a.name)].filter(Boolean);
    return names.some((name) => {
        const parts = normalizeName(name).split(' ').filter(Boolean);
        return targetWords.every((word) => parts.includes(word));
    });
}

const PERFORMER_ROLES = new Set(['primary_artists', 'featured_artists', 'singer']);

function getPerformingArtists(jioSong) {
    const artists = jioSong.artists;
    const performers = [];

    if (artists?.primary?.length) performers.push(...artists.primary);
    if (artists?.featured?.length) performers.push(...artists.featured);

    if (!performers.length && artists?.all?.length) {
        performers.push(...artists.all.filter((a) => PERFORMER_ROLES.has(a.role)));
    }

    if (!performers.length && artists?.all?.length) {
        performers.push(artists.all.find((a) => a.role === 'singer') || artists.all[0]);
    }

    return performers;
}

function mapPerformersToArtists(performers) {
    const seen = new Set();
    return performers
        .filter((a) => a?.name && a.id && !seen.has(a.id) && seen.add(a.id))
        .map((a) => ({
            id: `j:artist_${a.id}`,
            name: a.name,
        }));
}

function getPrimaryArtistName(jioSong) {
    const performers = getPerformingArtists(jioSong);
    if (performers.length) return performers[0].name;
    return 'Unknown Artist';
}

function mapJioSaavnToTrack(jioSong) {
    const cover = getBestQualityUrl(jioSong.image, IMAGE_QUALITY_PRIORITY);
    const streamUrl = getBestQualityUrl(jioSong.downloadUrl, QUALITY_PRIORITY);
    const performers = getPerformingArtists(jioSong);
    const allArtists = mapPerformersToArtists(performers);
    const primaryArtistName = allArtists[0]?.name || getPrimaryArtistName(jioSong);
    const artistId = allArtists[0]?.id || `j:artist_unknown`;

    return {
        id: `j:${jioSong.id}`,
        title: jioSong.name || 'Unknown Track',
        duration: typeof jioSong.duration === 'number' ? jioSong.duration : parseInt(jioSong.duration) || 0,
        artist: {
            id: artistId,
            name: primaryArtistName,
        },
        artists: allArtists,
        album: {
            id: jioSong.album?.id ? `j:album_${jioSong.album.id}` : `j:album_${jioSong.id}`,
            title: jioSong.album?.name || 'Unknown Album',
            cover: cover,
            image: cover,
        },
        cover: cover,
        image: cover,
        type: 'track',
        explicit: jioSong.explicitContent || false,
        year: jioSong.year ? parseInt(jioSong.year) : null,
        trackNumber: 0,
        popularity: jioSong.playCount || 0,
        language: jioSong.language || null,
        label: jioSong.label || null,
        copyright: jioSong.copyright || null,
        _jiosaavnId: jioSong.id,
        _streamUrl: streamUrl,
        _downloadUrl: streamUrl,
        isJioSaavn: true,
    };
}

function mapJioSaavnToAlbum(jioAlbum) {
    const cover = getBestQualityUrl(jioAlbum.image, IMAGE_QUALITY_PRIORITY);
    const primaryArtist =
        jioAlbum.primaryArtists?.[0]?.name || jioAlbum.artists?.primary?.[0]?.name || 'Unknown Artist';

    return {
        id: `j:album_${jioAlbum.id}`,
        title: jioAlbum.name || 'Unknown Album',
        artist: {
            id: `j:album_artist_${jioAlbum.id}`,
            name: primaryArtist,
        },
        artists: (jioAlbum.artists?.all || jioAlbum.primaryArtists || []).map((a) => ({
            id: `j:artist_${a.id}`,
            name: a.name,
        })),
        cover: cover,
        image: cover,
        type: 'album',
        year: jioAlbum.year ? parseInt(jioAlbum.year) : null,
        releaseDate: jioAlbum.year ? `${jioAlbum.year}-01-01` : null,
        songCount: jioAlbum.songCount || jioAlbum.songs?.length || 0,
        explicit: jioAlbum.explicitContent || false,
        language: jioAlbum.language || null,
        url: jioAlbum.url || '',
        _jiosaavnId: jioAlbum.id,
        tracks: jioAlbum.songs ? jioAlbum.songs.map(mapJioSaavnToTrack) : undefined,
        isJioSaavn: true,
    };
}

function mapJioSaavnToArtist(jioArtist) {
    const picture = getBestQualityUrl(jioArtist.image, IMAGE_QUALITY_PRIORITY);
    return {
        id: `j:artist_${jioArtist.id}`,
        name: jioArtist.name || 'Unknown Artist',
        picture: picture,
        cover: picture,
        image: picture,
        type: 'artist',
        _jiosaavnId: jioArtist.id,
        url: jioArtist.url || '',
        isJioSaavn: true,
    };
}

export class JioSaavnAPI {
    constructor() {
        this.baseUrls = getApiBaseUrls();
        this.activeBaseUrl = 0;
        this.streamUrlCache = new Map();
    }

    async fetchApi(path) {
        for (let i = 0; i < this.baseUrls.length; i++) {
            const baseUrl = this.baseUrls[i];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            try {
                const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
                clearTimeout(timeout);
                if (!response.ok) continue;
                this.activeBaseUrl = i;
                return await response.json();
            } catch (err) {
                clearTimeout(timeout);
                if (err.name === 'AbortError') continue;
                continue;
            }
        }
        throw new Error('All JioSaavn API URLs failed');
    }

    cacheStreamUrl(trackId, url) {
        if (trackId && url) {
            this.streamUrlCache.set(trackId, url);
        }
    }

    async fetchFromBase(baseIndex, path) {
        const baseUrl = this.baseUrls[baseIndex];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            clearTimeout(timeout);
            return null;
        }
    }

    async searchTracks(query, options = {}) {
        try {
            const page = options.page || 1;
            const limit = options.limit || 20;
            const path = `search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;

            const seen = new Set();
            const items = [];

            for (let i = 0; i < this.baseUrls.length; i++) {
                const data = await this.fetchFromBase(i, path);
                if (!data?.success || !data.data?.results) continue;
                this.activeBaseUrl = i;
                for (const raw of data.data.results) {
                    const item = mapJioSaavnToTrack(raw);
                    if (seen.has(item.id)) continue;
                    seen.add(item.id);
                    items.push(item);
                    if (item._streamUrl) {
                        this.cacheStreamUrl(item.id, item._streamUrl);
                    }
                }
                if (items.length) break;
            }

            return { items: items.slice(0, limit), total: items.length };
        } catch (err) {
            console.warn('JioSaavn track search failed:', err);
            return { items: [], total: 0 };
        }
    }

    async searchAlbums(query, options = {}) {
        try {
            const page = options.page || 1;
            const limit = options.limit || 10;
            const data = await this.fetchApi(
                `search/albums?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
            );
            if (!data || !data.success || !data.data?.results) {
                return { items: [], total: 0 };
            }
            const items = data.data.results.map(mapJioSaavnToAlbum);
            return { items, total: data.data.total || items.length };
        } catch (err) {
            console.warn('JioSaavn album search failed:', err);
            return { items: [], total: 0 };
        }
    }

    async searchArtists(query, options = {}) {
        try {
            const limit = options.limit || 10;
            const artists = [];
            const seen = new Set();

            const addArtist = (artist) => {
                if (!artist?.id || !artist?.name || seen.has(artist.id)) return;
                seen.add(artist.id);
                artists.push(artist);
            };

            for (const songQuery of [`${query} ghazal`, query]) {
                const songs = await this.searchTracks(songQuery, { limit: 20 });
                for (const song of songs.items) {
                    if (!artistNameMatches(song, query)) continue;
                    addArtist({
                        id: song.artist?.id || song.artists?.[0]?.id,
                        name: song.artist?.name || song.artists?.[0]?.name,
                        picture: song.cover || song.album?.cover,
                        cover: song.cover || song.album?.cover,
                        image: song.cover || song.album?.cover,
                        type: 'artist',
                        isJioSaavn: true,
                    });
                    for (const performer of song.artists || []) addArtist({
                        id: performer.id,
                        name: performer.name,
                        picture: song.cover || song.album?.cover,
                        cover: song.cover || song.album?.cover,
                        image: song.cover || song.album?.cover,
                        type: 'artist',
                        isJioSaavn: true,
                    });
                }
                if (artists.length >= limit) return { items: artists.slice(0, limit), total: artists.length };
            }

            const resolved = await this.resolveArtistByName(query);
            if (resolved) addArtist(resolved);

            const page = options.page || 1;
            const data = await this.fetchApi(
                `search/artists?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
            );
            if (data?.success && data.data?.results) {
                const target = normalizeName(query);
                for (const raw of data.data.results) {
                    const artist = mapJioSaavnToArtist(raw);
                    if (normalizeName(artist.name) === target || artistNameMatches({ artist }, query)) {
                        addArtist(artist);
                    }
                }
            }

            return { items: artists.slice(0, limit), total: artists.length };
        } catch (err) {
            console.warn('JioSaavn artist search failed:', err);
            return { items: [], total: 0 };
        }
    }

    async getTrack(id, quality) {
        const cleanId = id.replace(/^j:/, '');
        try {
            const data = await this.fetchApi(`songs/${encodeURIComponent(cleanId)}`);
            if (!data || !data.success || !data.data?.length) {
                return null;
            }
            const song = data.data[0];
            const track = mapJioSaavnToTrack(song);
            if (track._streamUrl) {
                this.cacheStreamUrl(track.id, track._streamUrl);
            }
            return track;
        } catch (err) {
            console.warn('JioSaavn getTrack failed:', err);
            return null;
        }
    }

    async fetchArtistData(artistId) {
        const cleanId = stripJioArtistId(artistId);
        const data = await this.fetchApi(`artists/${encodeURIComponent(cleanId)}`);
        if (!data?.success || !data.data) return null;
        return data.data;
    }

    async getArtist(id) {
        try {
            const raw = await this.fetchArtistData(id);
            if (!raw) return null;

            const mapped = mapJioSaavnToArtist(raw);
            const tracks = (raw.topSongs || []).map(mapJioSaavnToTrack);
            for (const track of tracks) {
                if (track._streamUrl) this.cacheStreamUrl(track.id, track._streamUrl);
            }

            const bioText = Array.isArray(raw.bio) ? raw.bio.map((b) => b.text).filter(Boolean).join('\n\n') : '';

            return {
                ...mapped,
                picture: mapped.picture || mapped.image,
                biography: bioText ? { text: bioText } : null,
                popularity: raw.followerCount
                    ? Math.min(99, Math.max(1, Math.round(Math.log10(raw.followerCount + 1) * 20)))
                    : 50,
                artistRoles: raw.dominantType ? [{ category: raw.dominantType }] : [],
                tracks,
                albums: (raw.topAlbums || []).map(mapJioSaavnToAlbum),
                eps: (raw.singles || []).map(mapJioSaavnToAlbum),
            };
        } catch (err) {
            console.warn('JioSaavn getArtist failed:', err);
            return null;
        }
    }

    async getArtistBiography(id) {
        try {
            const raw = await this.fetchArtistData(id);
            if (!raw?.bio?.length) return null;
            return { text: raw.bio.map((b) => b.text).filter(Boolean).join('\n\n') };
        } catch {
            return null;
        }
    }

    async resolveArtistByName(name) {
        if (!name) return null;
        const target = normalizeName(name);

        try {
            for (const query of [`${name} ghazal`, name]) {
                const songs = await this.searchTracks(query, { limit: 20 });
                for (const song of songs.items) {
                    if (!artistNameMatches(song, name)) continue;
                    const performer =
                        (song.artists || []).find((a) => normalizeName(a.name) === target) ||
                        song.artists?.[0] ||
                        song.artist;
                    if (performer?.id) {
                        return {
                            id: performer.id.startsWith('j:') ? performer.id : `j:artist_${performer.id}`,
                            name: String(performer.name).replace(/\u00a0/g, ' ').trim(),
                            picture: song.cover,
                            cover: song.cover,
                            image: song.cover,
                            type: 'artist',
                            isJioSaavn: true,
                        };
                    }
                }
            }

            const result = await this.searchArtists(name, { limit: 10 });
            const exact = result.items.find((a) => normalizeName(a.name) === target);
            return exact || null;
        } catch {
            return null;
        }
    }

    async getCoArtistsFromSongs(artistName, excludeId = null, limit = 8) {
        try {
            const seen = new Set(excludeId ? [excludeId] : []);
            const artists = [];
            const targetNorm = normalizeName(artistName);

            const collectFromTracks = (tracks, requireMatch = true) => {
                for (const track of tracks) {
                    if (requireMatch && !artistNameMatches(track, artistName)) continue;
                    for (const performer of track.artists || (track.artist ? [track.artist] : [])) {
                        if (!performer?.id || !performer?.name || seen.has(performer.id)) continue;
                        if (normalizeName(performer.name) === targetNorm) continue;
                        seen.add(performer.id);
                        artists.push({
                            id: performer.id,
                            name: performer.name,
                            picture: track.cover || track.album?.cover,
                            cover: track.cover || track.album?.cover,
                            image: track.cover || track.album?.cover,
                            type: 'artist',
                            isJioSaavn: true,
                        });
                        if (artists.length >= limit) return true;
                    }
                }
                return false;
            };

            for (const query of [`${artistName} ghazal`, artistName]) {
                const result = await this.searchTracks(query, { limit: 25 });
                if (collectFromTracks(result.items, true)) return artists;
            }

            const ghazalMix = await this.searchTracks('ghazal', { limit: 30 });
            collectFromTracks(ghazalMix.items, false);

            return artists.slice(0, limit);
        } catch {
            return [];
        }
    }

    async getSimilarArtists(artistId) {
        try {
            const raw = await this.fetchArtistData(artistId);
            const selfId = `j:artist_${stripJioArtistId(artistId)}`;
            const similar = (raw?.similarArtists || [])
                .map(mapJioSaavnToArtist)
                .filter((a) => a.id !== selfId);
            if (similar.length) return similar.slice(0, 8);

            const name = raw?.name;
            if (!name) return [];

            const coArtists = await this.getCoArtistsFromSongs(name, selfId, 8);
            if (coArtists.length) return coArtists;

            const result = await this.searchArtists(name, { limit: 8 });
            return result.items.filter((a) => a.id !== selfId).slice(0, 6);
        } catch (err) {
            console.warn('JioSaavn getSimilarArtists failed:', err);
            return [];
        }
    }

    async getArtistTopTracks(artistId, options = {}) {
        try {
            const artist = await this.getArtist(artistId);
            const limit = options.limit || 20;
            return { items: (artist?.tracks || []).slice(0, limit) };
        } catch {
            return { items: [] };
        }
    }

    async getSimilarAlbums(albumId) {
        try {
            const albumData = await this.getAlbum(albumId);
            const album = albumData?.album;
            if (!album) return [];

            const artistName = album.artist?.name || album.artists?.[0]?.name;
            if (!artistName) return [];

            const result = await this.searchAlbums(artistName, { limit: 12 });
            const cleanAlbumId = album.id || albumId;
            return result.items.filter((a) => a.id !== cleanAlbumId).slice(0, 8);
        } catch (err) {
            console.warn('JioSaavn getSimilarAlbums failed:', err);
            return [];
        }
    }

    async getTrackRecommendations(trackId) {
        try {
            const track = await this.getTrack(trackId);
            if (!track) return [];

            const artistId = track.artist?.id || track.artists?.[0]?.id;
            if (artistId?.startsWith('j:artist_')) {
                const artist = await this.getArtist(artistId);
                return (artist?.tracks || []).filter((t) => t.id !== track.id).slice(0, 20);
            }

            const artistName = track.artist?.name || track.artists?.[0]?.name;
            if (!artistName) return [];

            const result = await this.searchTracks(`${artistName} ${track.album?.title || ''}`.trim(), {
                limit: 15,
            });
            return result.items.filter((t) => t.id !== track.id).slice(0, 20);
        } catch (err) {
            console.warn('JioSaavn getTrackRecommendations failed:', err);
            return [];
        }
    }

    async getAlbumsForArtistName(artistName, limit = 12) {
        if (!artistName) return [];
        try {
            const result = await this.searchAlbums(artistName, { limit: 20 });
            const fromAlbumSearch = result.items
                .filter((album) => artistNameMatches({ artist: album.artist, artists: album.artists }, artistName))
                .slice(0, limit);
            if (fromAlbumSearch.length) return fromAlbumSearch;

            const albumMap = new Map();
            for (const query of [`${artistName} ghazal`, artistName]) {
                const songs = await this.searchTracks(query, { limit: 20 });
                for (const track of songs.items) {
                    if (!artistNameMatches(track, artistName)) continue;
                    const album = track.album;
                    if (!album?.id || albumMap.has(album.id)) continue;
                    albumMap.set(album.id, {
                        ...album,
                        artist: album.artist || track.artist,
                        artists: album.artists || track.artists,
                    });
                }
                if (albumMap.size >= limit) break;
            }
            return [...albumMap.values()].slice(0, limit);
        } catch {
            return [];
        }
    }

    async _addArtistTopTracks(artistName, seenTrackIds, recommended, limit, options = {}) {
        const resolved = await this.resolveArtistByName(artistName);
        let topTracks = [];

        if (resolved?.id?.startsWith('j:artist_')) {
            const artistData = await this.getArtist(resolved.id);
            topTracks = (artistData?.tracks || []).filter((t) => artistNameMatches(t, artistName));
        }

        for (const query of [`${artistName} ghazal`, artistName]) {
            if (topTracks.length >= 8) break;
            const search = await this.searchTracks(query, { limit: 15 });
            for (const track of search.items) {
                if (artistNameMatches(track, artistName)) topTracks.push(track);
            }
        }

        const deduped = [];
        const seen = new Set();
        for (const track of topTracks) {
            if (seen.has(track.id)) continue;
            seen.add(track.id);
            deduped.push(track);
        }
        topTracks = deduped;

        for (const track of topTracks) {
            if (recommended.length >= limit) break;
            if (seenTrackIds.has(track.id)) continue;
            if (options.knownTrackIds?.has(track.id)) continue;
            seenTrackIds.add(track.id);
            recommended.push(track);
        }
    }

    async getRecommendedTracksForPlaylist(tracks, limit = 20, options = {}) {
        if (!tracks?.length) return [];

        const seenTrackIds = new Set(tracks.map((t) => t.id));
        const recommended = [];
        const seenArtists = new Set();

        for (const seed of tracks.slice(0, 10)) {
            if (recommended.length >= limit) break;

            if (seed.id?.startsWith('j:')) {
                const trackRecs = await this.getTrackRecommendations(seed.id);
                for (const track of trackRecs) {
                    if (recommended.length >= limit) break;
                    if (seenTrackIds.has(track.id)) continue;
                    if (options.knownTrackIds?.has(track.id)) continue;
                    seenTrackIds.add(track.id);
                    recommended.push(track);
                }
            }

            const artistName = seed.artist?.name || seed.artists?.[0]?.name;
            if (!artistName || seenArtists.has(normalizeName(artistName))) continue;
            seenArtists.add(normalizeName(artistName));

            await this._addArtistTopTracks(artistName, seenTrackIds, recommended, limit, options);
        }

        return recommended.slice(0, limit);
    }

    async getAlbum(id) {
        let cleanId = id;
        if (typeof cleanId === 'string') {
            cleanId = cleanId.replace(/^j:album_/, '').replace(/^j:/, '');
        }
        try {
            const data = await this.fetchApi(`albums?id=${encodeURIComponent(cleanId)}`);
            if (!data || !data.success || !data.data) {
                return null;
            }
            const album = data.data;
            const mapped = mapJioSaavnToAlbum(album);
            const tracks = (album.songs || []).map(mapJioSaavnToTrack);
            for (const track of tracks) {
                if (track._streamUrl) {
                    this.cacheStreamUrl(track.id, track._streamUrl);
                }
            }
            return {
                album: mapped,
                tracks,
            };
        } catch (err) {
            console.warn('JioSaavn getAlbum failed:', err);
            return null;
        }
    }

    async getStreamUrl(id, quality) {
        if (!id) {
            return { url: null, provider: 'jiosaavn', playbackType: 'direct', error: 'no id' };
        }

        const cached = this.streamUrlCache.get(id);
        if (cached) {
            return { url: cached, provider: 'jiosaavn', playbackType: 'direct' };
        }

        const cleanId = id.replace(/^j:/, '');
        try {
            const data = await this.fetchApi(`songs/${encodeURIComponent(cleanId)}`);
            if (data && data.success && data.data?.length) {
                const song = data.data[0];
                const rawUrl = getBestQualityUrl(song.downloadUrl, QUALITY_PRIORITY);
                if (rawUrl) {
                    this.cacheStreamUrl(id, rawUrl);
                    return { url: rawUrl, provider: 'jiosaavn', playbackType: 'direct' };
                }
            }
        } catch (err) {
            console.warn('JioSaavn getStreamUrl failed:', err);
        }

        return { url: null, provider: 'jiosaavn', playbackType: 'direct', error: 'no stream url' };
    }

    getCoverUrl(id, _size) {
        if (!id) return null;
        if (typeof id === 'string' && (id.startsWith('http') || id.startsWith('blob:'))) {
            return enhanceCoverUrl(id);
        }
        return id;
    }

    getArtistPictureUrl(id, _size) {
        return this.getCoverUrl(id);
    }
}
