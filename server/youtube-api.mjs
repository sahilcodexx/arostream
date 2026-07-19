import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
    searchYouTube,
    getYouTubeTrack,
    getYouTubeStream,
    getYouTubeRelatedTracks,
    getYouTubeStreamByIndex,
    clearYouTubeStreamCache,
} from './youtube-handler.mjs';

const PORT = Number(process.env.YOUTUBE_API_PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Full rotation order: proven clients first, then exotic
// Must match the order in youtube-handler.mjs's resolveYouTubeStream
const CLIENT_ROTATION = [
    'YTMUSIC',
    'IOS',
    'ANDROID',
    'ANDROID_VR',
    'TV_EMBEDDED',
    'YTMUSIC_ANDROID',
    'TV',
    'TV_SIMPLY',
    'MWEB',
    'WEB_EMBEDDED',
    'WEB',
    'WEB_CREATOR',
];

// Exponential backoff delays (ms)
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function corsHeaders(extra = {}) {
    return {
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        ...extra,
    };
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        ...corsHeaders(),
    });
    res.end(JSON.stringify(data));
}

async function openUpstreamStream(videoId, req, abort, clientIndex = 0, rangeHeader = null) {
    const stream =
        clientIndex > 0
            ? await getYouTubeStream(videoId, CLIENT_ROTATION[clientIndex % CLIENT_ROTATION.length])
            : await getYouTubeStream(videoId);

    if (stream.error) return { stream, upstream: null };

    const upstreamHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: '*/*',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
    }

    const upstream = await fetch(stream.url, { headers: upstreamHeaders, signal: abort.signal });
    return { stream, upstream };
}

// Per-error-type recovery — Echo Music inspired
// 403 → expired URL, clear cache and rotate client
// 416 → range not satisfiable, drop range and retry
// 404/410 → not found/gone, clear cache and try next client
// Network errors → exponential backoff
async function proxyAudioPlayback(videoId, req, res) {
    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.on('close', onClose);

    let stream;
    let upstream;
    let clientIndex = 0;
    let rangeHeader = req.headers.range || 'bytes=0-';
    let backoffAttempt = 0;
    let lastError = null;

    const tryWithRotation = async () => {
        try {
            ({ stream, upstream } = await openUpstreamStream(videoId, req, abort, clientIndex, rangeHeader));
            lastError = null;
            return true;
        } catch (err) {
            lastError = err;
            return false;
        }
    };

    try {
        let ok = await tryWithRotation();

        while (!ok || !upstream?.ok || !upstream?.body) {
            const status = upstream?.status;
            const isHttpError = status && status >= 400;

            if (!ok && !isHttpError) {
                // Network/connection error — exponential backoff
                if (backoffAttempt < BACKOFF_DELAYS.length) {
                    const delay = BACKOFF_DELAYS[backoffAttempt];
                    backoffAttempt++;
                    console.warn(
                        `[YT Proxy] ${videoId} network error (attempt ${backoffAttempt}), backing off ${delay}ms`
                    );
                    await sleep(delay);
                    if (abort.signal.aborted) return;
                    ok = await tryWithRotation();
                    continue;
                }
                break;
            }

            // 416 Range Not Satisfiable — clear cache, drop Range, retry with same client
            if (status === 416) {
                console.warn(`[YT Proxy] ${videoId} returned 416 (range not satisfiable), dropping range header`);
                clearYouTubeStreamCache(videoId);
                rangeHeader = null;
                ok = await tryWithRotation();
                continue;
            }

            // 403/404/410 — clear cache, rotate to next client
            if (isHttpError && [403, 404, 410].includes(status)) {
                if (clientIndex < CLIENT_ROTATION.length - 1) {
                    clearYouTubeStreamCache(videoId);
                    clientIndex++;
                    backoffAttempt = 0;
                    const clientName = CLIENT_ROTATION[clientIndex % CLIENT_ROTATION.length];
                    console.warn(
                        `[YT Proxy] ${videoId} returned ${status}, rotating to ${clientName} (client ${clientIndex + 1}/${CLIENT_ROTATION.length})`
                    );
                    ok = await tryWithRotation();
                    continue;
                }
                break;
            }

            // Any other error — break
            break;
        }

        // If we exhausted rotation and still have errors, try a brief backoff + retry from start
        if ((!ok || !upstream?.ok || !upstream?.body) && backoffAttempt < 3) {
            backoffAttempt++;
            const delay = BACKOFF_DELAYS[Math.min(backoffAttempt, BACKOFF_DELAYS.length - 1)];
            console.warn(
                `[YT Proxy] ${videoId} exhausted clients, final backoff ${delay}ms (attempt ${backoffAttempt})`
            );
            await sleep(delay);
            if (abort.signal.aborted) return;
            clientIndex = 0;
            rangeHeader = req.headers.range || 'bytes=0-';
            clearYouTubeStreamCache(videoId);
            ok = await tryWithRotation();
        }
    } catch (err) {
        req.off('close', onClose);
        if (err.name === 'AbortError' || abort.signal.aborted) return;
        if (!res.headersSent) sendJson(res, 502, { error: err.message || 'upstream fetch failed' });
        return;
    }

    if (stream?.error) {
        req.off('close', onClose);
        sendJson(res, 503, stream);
        return;
    }

    if (!upstream?.ok || !upstream.body) {
        req.off('close', onClose);
        if (!res.headersSent) {
            const errMsg = lastError
                ? `upstream failed: ${lastError.message}`
                : `upstream ${upstream?.status || 'fetch failed'}`;
            sendJson(res, upstream?.status || 502, { error: errMsg });
        }
        return;
    }

    const responseHeaders = corsHeaders({
        'Content-Type': stream.mimeType || upstream.headers.get('content-type') || 'audio/mp4',
        'Accept-Ranges': 'bytes',
    });

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    res.writeHead(upstream.status, responseHeaders);

    try {
        await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (err) {
        if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.name !== 'AbortError') {
            console.warn('YouTube stream proxy error:', err.message);
        }
    } finally {
        req.off('close', onClose);
    }
}

function extractVideoId(raw) {
    const id = String(raw || '').replace(/^yt:/, '');
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    try {
        if (url.pathname === '/health') {
            sendJson(res, 200, { ok: true });
            return;
        }

        if (url.pathname === '/search' && req.method === 'GET') {
            const query = url.searchParams.get('q') || '';
            const limit = Math.min(Number(url.searchParams.get('limit') || 20), 30);
            if (!query.trim()) {
                sendJson(res, 400, { error: 'missing query param q' });
                return;
            }
            const result = await searchYouTube(query.trim(), limit).catch((err) => {
                console.warn('YouTube search route failed:', err.message);
                return { items: [], total: 0 };
            });
            sendJson(res, 200, result);
            return;
        }

        const playMatch = url.pathname.match(/^\/play\/([a-zA-Z0-9_-]{11})$/);
        if (playMatch && req.method === 'GET') {
            try {
                await proxyAudioPlayback(playMatch[1], req, res);
            } catch (err) {
                console.error('Play proxy error:', err);
                if (!res.headersSent) sendJson(res, 500, { error: err.message || 'play failed' });
            }
            return;
        }

        const streamMatch = url.pathname.match(/^\/stream\/([a-zA-Z0-9_-]{11})$/);
        if (streamMatch && req.method === 'GET') {
            const stream = await getYouTubeStream(streamMatch[1]);
            if (stream.error) {
                sendJson(res, 503, stream);
                return;
            }
            sendJson(res, 200, stream);
            return;
        }

        const videoMatch = url.pathname.match(/^\/video\/([a-zA-Z0-9_-]{11})$/);
        if (videoMatch && req.method === 'GET') {
            const track = await getYouTubeTrack(videoMatch[1]);
            if (!track) {
                sendJson(res, 404, { error: 'not found' });
                return;
            }
            sendJson(res, 200, track);
            return;
        }

        const relatedMatch = url.pathname.match(/^\/related\/([a-zA-Z0-9_-]{11})$/);
        if (relatedMatch && req.method === 'GET') {
            const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);
            const result = await getYouTubeRelatedTracks(relatedMatch[1], limit).catch((err) => {
                console.warn('YouTube related route failed:', err.message);
                return { items: [], total: 0 };
            });
            sendJson(res, 200, result);
            return;
        }

        sendJson(res, 404, { error: 'not found' });
    } catch (err) {
        console.error('YouTube API error:', err);
        sendJson(res, 500, { error: err.message || 'internal error' });
    }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.requestTimeout = 0;

server.listen(PORT, '127.0.0.1', () => {
    console.log(`YouTube API backend running at http://127.0.0.1:${PORT}`);
    console.log('  GET /search?q=...');
    console.log('  GET /play/:videoId');
    console.log('  GET /stream/:videoId');
    console.log('  GET /video/:videoId');
    console.log('  GET /related/:videoId');
});

process.on('uncaughtException', (err) => {
    console.error('YouTube API uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('YouTube API unhandledRejection:', err);
});
