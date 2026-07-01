import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
    searchYouTube,
    getYouTubeTrack,
    getYouTubeStream,
    getYouTubeRelatedTracks,
} from './youtube-handler.mjs';

const PORT = Number(process.env.YOUTUBE_API_PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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

async function proxyAudioPlayback(videoId, req, res) {
    const stream = await getYouTubeStream(videoId);
    if (stream.error) {
        sendJson(res, 404, stream);
        return;
    }

    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.on('close', onClose);

    const upstreamHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: '*/*',
        Range: req.headers.range || 'bytes=0-',
    };

    let upstream;
    try {
        upstream = await fetch(stream.url, { headers: upstreamHeaders, signal: abort.signal });
    } catch (err) {
        req.off('close', onClose);
        if (err.name === 'AbortError' || abort.signal.aborted) return;
        if (!res.headersSent) sendJson(res, 502, { error: err.message || 'upstream fetch failed' });
        return;
    }

    if (!upstream.ok || !upstream.body) {
        req.off('close', onClose);
        if (!res.headersSent) {
            sendJson(res, upstream.status || 502, { error: `upstream ${upstream.status}` });
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
            const result = await searchYouTube(query.trim(), limit);
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
                sendJson(res, 404, stream);
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
            const result = await getYouTubeRelatedTracks(relatedMatch[1], limit);
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