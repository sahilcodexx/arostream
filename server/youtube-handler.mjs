import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Innertube } from 'youtubei.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveYtdlpPath() {
    if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
    const bundled = join(__dirname, 'bin', 'yt-dlp');
    if (existsSync(bundled)) return bundled;
    return 'yt-dlp';
}

function mimeFromStreamUrl(url) {
    if (!url) return 'audio/mp4';
    if (url.includes('mime=audio%2Fwebm') || url.includes('audio/webm')) return 'audio/webm';
    if (url.includes('mime=audio%2Fmp4') || url.includes('audio/mp4')) return 'audio/mp4';
    return 'audio/mp4';
}

const PIPED_INSTANCES = ['https://api.piped.private.coffee'];
const STREAM_CACHE_TTL_MS = 30 * 60 * 1000;

const streamCache = new Map();
const streamInflight = new Map();

let innertubePromise = null;

function getCachedStream(videoId) {
    const entry = streamCache.get(videoId);
    if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) streamCache.delete(videoId);
        return null;
    }
    return entry.stream;
}

function cacheStream(videoId, stream) {
    if (!stream || stream.error) return;
    streamCache.set(videoId, { stream, expiresAt: Date.now() + STREAM_CACHE_TTL_MS });
}

async function getInnertube() {
    if (!innertubePromise) {
        innertubePromise = Innertube.create({ generate_session_locally: true });
    }
    return innertubePromise;
}

function parseArtist(name) {
    if (!name) return 'Unknown Artist';
    return (
        String(name)
            .split(',')[0]
            .replace(/\s*-\s*Topic$/i, '')
            .trim() || 'Unknown Artist'
    );
}

function getTitleText(title) {
    if (!title) return '';
    if (typeof title === 'string') return title;
    return title.text || title.toString?.() || '';
}

function isValidYouTubeTrack(track) {
    if (!track?._videoId || !track?.title) return false;
    const title = getTitleText(track.title).trim().toLowerCase();
    const artist = parseArtist(track.artist?.name).toLowerCase();
    if (!title || title === 'topic' || title === 'unknown track') return false;
    if (artist === 'topic') return false;
    return isLikelySong(track);
}

function parseDurationSeconds(duration) {
    if (!duration) return 0;
    if (typeof duration === 'number') return duration;
    if (duration.seconds) return duration.seconds;
    const text = duration.text || String(duration);
    const parts = text.split(':').map(Number);
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function getThumbnailUrl(thumbnails, fallbackId = null) {
    const list = Array.isArray(thumbnails) ? thumbnails : thumbnails ? [thumbnails] : [];
    const best = list
        .map((thumb) => (typeof thumb === 'string' ? { url: thumb } : thumb))
        .filter((thumb) => thumb?.url)
        .sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0))[0];

    const url = best?.url || (fallbackId ? `https://i.ytimg.com/vi/${fallbackId}/maxresdefault.jpg` : null);
    return enhanceYouTubeThumbnail(url, fallbackId);
}

function enhanceYouTubeThumbnail(url, fallbackId = null) {
    if (!url && fallbackId) return `https://i.ytimg.com/vi/${fallbackId}/maxresdefault.jpg`;
    if (!url) return null;

    const cleanUrl = String(url).replace(/^http:\/\//, 'https://');
    if (cleanUrl.includes('i.ytimg.com/vi/')) {
        return cleanUrl.replace(/\/(default|mqdefault|hqdefault|sddefault)(\.[a-z]+)?(?:\?.*)?$/i, '/maxresdefault.jpg');
    }

    if (cleanUrl.includes('yt3.googleusercontent.com')) {
        return cleanUrl
            .replace(/=w\d+-h\d+[^&]*/i, '=w640-h640-l90-rj')
            .replace(/=s\d+[^&]*/i, '=s640');
    }

    return cleanUrl;
}

function buildTrack({ id, title, artist, thumbnail, duration }) {
    if (!id) return null;
    const parsedArtist = parseArtist(artist || 'Unknown Artist');
    const cover = enhanceYouTubeThumbnail(thumbnail, id);
    const durationSeconds = parseDurationSeconds(duration);

    return {
        id: `yt:${id}`,
        title: title || 'Unknown Track',
        duration: durationSeconds,
        artist: { id: `yt:artist_${id}`, name: parsedArtist },
        artists: [{ id: `yt:artist_${id}`, name: parsedArtist }],
        album: { id: `yt:album_${id}`, title: 'YouTube', cover, image: cover },
        cover,
        image: cover,
        type: 'track',
        _videoId: id,
        isYouTube: true,
        source: 'youtube',
    };
}

function mapMusicItemToTrack(item) {
    const id = item.id || item.endpoint?.payload?.videoId;
    const artist = item.artists?.[0]?.name || item.author?.name || item.authors?.[0]?.name;
    const thumbnail = getThumbnailUrl(item.thumbnails, id);
    return buildTrack({
        id,
        title: item.title,
        artist,
        thumbnail,
        duration: item.duration,
    });
}

function mapVideoToTrack(video) {
    const id = video.id;
    if (!id) return null;

    const title =
        video.title?.text ||
        (typeof video.title === 'string' ? video.title : null) ||
        video.basic_info?.title ||
        'Unknown Track';

    const artist =
        video.author?.name ||
        video.artists?.[0]?.name ||
        video.basic_info?.author ||
        'Unknown Artist';

    const thumbnail = getThumbnailUrl(video.thumbnails || video.basic_info?.thumbnail || video.best_thumbnail, id);
    const duration = video.duration?.seconds || video.duration || 0;

    return buildTrack({ id, title, artist, thumbnail, duration });
}

function isLikelySong(track) {
    if (!track?.duration) return true;
    return track.duration <= 1200;
}

export async function searchYouTube(query, limit = 20) {
    const yt = await getInnertube();
    const items = [];
    const seen = new Set();

    const addTrack = (track) => {
        if (!track || !isValidYouTubeTrack(track) || seen.has(track._videoId)) return false;
        seen.add(track._videoId);
        items.push(track);
        return true;
    };

    try {
        const musicSearch = await yt.music.search(query, { type: 'song' });
        for (const item of musicSearch.songs?.contents || []) {
            addTrack(mapMusicItemToTrack(item));
            if (items.length >= limit) break;
        }
    } catch (err) {
        console.warn('YouTube Music search failed:', err.message);
    }

    if (items.length < limit) {
        try {
            const search = await yt.search(query, { type: 'SONG' });
            for (const result of search.results || []) {
                if (result.type === 'Song' || result.type === 'Video') {
                    addTrack(mapVideoToTrack(result));
                }
                if (items.length >= limit) break;
            }
        } catch (err) {
            console.warn('YouTube song search failed:', err.message);
        }
    }

    if (items.length < limit) {
        const pipedItems = await searchYouTubePiped(query, limit - items.length);
        for (const item of pipedItems) {
            addTrack(item);
            if (items.length >= limit) break;
        }
    }

    return { items, total: items.length };
}

async function searchYouTubePiped(query, limit) {
    for (const base of PIPED_INSTANCES) {
        try {
            const url = `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (!data?.items?.length) continue;

            return data.items
                .map((item) => {
                    const match = item.url?.match(/v=([a-zA-Z0-9_-]{11})/);
                    const videoId = match?.[1];
                    if (!videoId) return null;
                    return mapVideoToTrack({
                        id: videoId,
                        title: { text: item.title },
                        author: { name: item.uploaderName },
                        duration: { seconds: item.duration },
                        best_thumbnail: { url: enhanceYouTubeThumbnail(item.thumbnail, videoId) },
                    });
                })
                .filter(Boolean)
                .slice(0, limit);
        } catch {
            continue;
        }
    }
    return [];
}

function mapPlaylistPanelVideo(item) {
    const id = item.video_id || item.id;
    if (!id) return null;
    const artistNames = (item.artists || []).map((a) => a.name).filter(Boolean);
    const artist = artistNames.length ? artistNames.join(', ') : parseArtist(item.author?.name);
    const thumbnail = getThumbnailUrl(item.thumbnails, id);
    return buildTrack({
        id,
        title: getTitleText(item.title),
        artist,
        thumbnail,
        duration: item.duration?.seconds || item.duration,
    });
}

function mapMusicShelfItem(item) {
    const id = item.id || item.endpoint?.payload?.videoId;
    if (!id) return null;
    const artistNames = (item.artists || []).map((a) => a.name).filter(Boolean);
    return buildTrack({
        id,
        title: getTitleText(item.title),
        artist: artistNames.join(', ') || 'Unknown Artist',
        thumbnail: getThumbnailUrl(item.thumbnails, id),
        duration: item.duration?.seconds || item.duration,
    });
}

async function getArtistTopSongs(artistName, excludeVideoId = null, limit = 15) {
    const yt = await getInnertube();
    const items = [];
    const seen = new Set();

    try {
        const search = await yt.music.search(artistName, { type: 'artist' });
        const match =
            search.artists?.contents?.find(
                (a) => parseArtist(a.name).toLowerCase() === parseArtist(artistName).toLowerCase()
            ) || search.artists?.contents?.[0];
        const browseId = match?.browse_id || match?.channel_id;
        if (!browseId) return items;

        const page = await yt.music.getArtist(browseId);
        for (const section of page.sections || []) {
            if (section.type !== 'MusicShelf') continue;
            for (const song of section.contents || []) {
                const track = mapMusicShelfItem(song);
                if (!track || !isValidYouTubeTrack(track) || !isLikelySong(track)) continue;
                if (excludeVideoId && track._videoId === excludeVideoId) continue;
                if (seen.has(track._videoId)) continue;
                seen.add(track._videoId);
                items.push(track);
                if (items.length >= limit) return items;
            }
        }
    } catch (err) {
        console.warn('YouTube artist songs failed:', err.message);
    }

    return items;
}

export async function getYouTubeRelatedTracks(videoId, limit = 20) {
    const cleanId = String(videoId || '').replace(/^yt:/, '');
    if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
        return { items: [], total: 0 };
    }

    const items = [];
    const seen = new Set([cleanId]);

    try {
        const yt = await getInnertube();
        const panel = await yt.music.getUpNext(cleanId);
        const contents = panel.contents || [];
        for (let i = 0; i < contents.length; i++) {
            const track = mapPlaylistPanelVideo(contents[i]);
            if (!track || !isValidYouTubeTrack(track) || !isLikelySong(track)) continue;
            if (seen.has(track._videoId)) continue;
            seen.add(track._videoId);
            items.push(track);
            if (items.length >= limit) break;
        }
    } catch (err) {
        console.warn('YouTube getUpNext failed:', err.message);
    }

    if (items.length < limit) {
        try {
            const seed = await getYouTubeTrack(cleanId);
            const artistName = seed?.artist?.name;
            if (artistName && artistName !== 'Unknown Artist') {
                const artistSongs = await getArtistTopSongs(artistName, cleanId, limit - items.length);
                for (const track of artistSongs) {
                    if (seen.has(track._videoId)) continue;
                    seen.add(track._videoId);
                    items.push(track);
                    if (items.length >= limit) break;
                }
            }
        } catch (err) {
            console.warn('YouTube artist fallback failed:', err.message);
        }
    }

    return { items, total: items.length };
}

export async function getYouTubeTrack(videoId) {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);
    return mapVideoToTrack({
        id: videoId,
        title: info.basic_info.title,
        author: { name: info.basic_info.author },
        duration: { seconds: info.basic_info.duration },
        best_thumbnail: { url: getThumbnailUrl(info.basic_info.thumbnail, videoId) },
    });
}

async function getStreamViaYtdlp(videoId) {
    try {
        const ytdlp = resolveYtdlpPath();
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const { stdout } = await execFileAsync(
            ytdlp,
            ['-f', 'ba', '--get-url', '--no-playlist', '--no-warnings', watchUrl],
            { timeout: 30000, maxBuffer: 1024 * 1024 }
        );
        const url = stdout.trim().split('\n').find((line) => line.startsWith('http'));
        if (!url) return null;
        return { url, mimeType: mimeFromStreamUrl(url), source: 'ytdlp' };
    } catch (err) {
        console.warn('yt-dlp stream failed:', err.message);
        return null;
    }
}

async function getStreamViaInnertube(videoId) {
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId, { client: 'IOS' });
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!format?.url) return null;
    return { url: format.url, mimeType: format.mime_type || 'audio/mp4', source: 'innertube' };
}

async function getStreamViaPiped(videoId) {
    for (const base of PIPED_INSTANCES) {
        try {
            const res = await fetch(`${base}/streams/${videoId}`, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.error || !data.audioStreams?.length) continue;
            const stream = data.audioStreams
                .filter((s) => s.mimeType?.startsWith('audio/') && s.url)
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (stream?.url) return { url: stream.url, mimeType: stream.mimeType };
        } catch {
            continue;
        }
    }
    return null;
}

async function resolveYouTubeStream(videoId) {
    const cached = getCachedStream(videoId);
    if (cached) return cached;

    let stream = await getStreamViaYtdlp(videoId);
    if (!stream) stream = await getStreamViaInnertube(videoId);
    if (!stream) stream = await getStreamViaPiped(videoId);
    if (!stream) return { error: 'no stream url' };

    cacheStream(videoId, stream);
    return stream;
}

export async function getYouTubeStream(videoId) {
    const cached = getCachedStream(videoId);
    if (cached) return cached;

    if (streamInflight.has(videoId)) {
        return streamInflight.get(videoId);
    }

    const promise = resolveYouTubeStream(videoId).finally(() => {
        streamInflight.delete(videoId);
    });
    streamInflight.set(videoId, promise);
    return promise;
}
