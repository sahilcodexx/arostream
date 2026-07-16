import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import { LosslessAPI } from '../api.js';

vi.mock('../storage.js', () => ({
    amazonMusicSettings: {
        isEnabled: vi.fn(() => false),
        getTurnstileSiteKey: vi.fn(() => 'test-site-key'),
        getTurnstileBypassToken: vi.fn(() => ''),
        getApiBaseUrl: vi.fn(() => ''),
        getConverterBaseUrl: vi.fn(() => ''),
    },
    devModeSettings: {
        isEnabled: vi.fn(() => false),
        getUrl: vi.fn(() => ''),
    },
    preferDolbyAtmosSettings: {
        isEnabled: vi.fn(() => false),
    },
    deezerFallbackSettings: {
        isEnabled: vi.fn(() => false),
        getApiBaseUrl: vi.fn(() => ''),
    },
    trackDateSettings: {
        useAlbumYear: vi.fn(() => false),
    },
    coverArtSizeSettings: {
        getSize: vi.fn(() => '1280'),
    },
    qualityBadgeSettings: { isEnabled: vi.fn(() => true) },
    losslessContainerSettings: {
        getContainer: vi.fn(() => 'flac'),
        setContainer: vi.fn(),
    },
}));

describe('Amazon Music playback metadata', () => {
    const api = new LosslessAPI({});

    test('uses MP4 codec identifiers in generated DASH metadata', () => {
        expect(api.getAmazonCodecString('flac')).toBe('fLaC');
        expect(api.getAmazonCodecString('aac')).toBe('aac');
        expect(api.getAmazonCodecString('eac3')).toBe('eac3');
    });

    test('uses the normalized codec in Amazon MIME types and manifests', () => {
        const qualityInfo = { codec: 'flac', bandwidth: 1200000, sampleRate: 96000 };
        expect(api.getAmazonMimeType(qualityInfo)).toBe('audio/mp4; codecs="fLaC"');

        const manifest = api.createAmazonMusicDashManifest(
            'https://amazon.example/audio.mp4',
            { asin: 'B000000000' },
            qualityInfo,
            {
                keyId: '00112233445566778899aabbccddeeff',
                initRangeEnd: 999,
                sidx: {
                    start: 1000,
                    end: 1099,
                    durationSeconds: 180,
                    timescale: 44100,
                    earliestPresentationTime: 0,
                },
            }
        );

        expect(manifest).toContain('codecs="fLaC"');
        expect(manifest).toContain('mimeType="audio/mp4"');
        expect(manifest).toContain('cenc:default_KID="00112233-4455-6677-8899-aabbccddeeff"');
    });
});

describe('Amazon Music source selection', () => {
    let api;

    beforeEach(() => {
        api = new LosslessAPI({});
        api.getTrackMetadata = vi.fn(() =>
            Promise.resolve({
                id: '71513806',
                title: 'Song',
                artist: { name: 'Artist' },
                album: { title: 'Album' },
                isrc: 'USABC1234567',
            })
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('tries Qobuz first when it resolves a stream URL', async () => {
        const calls = [];
        api.getQobuzStreamUrl = vi.fn(() => {
            calls.push('qobuz');
            return Promise.resolve({ url: 'https://qobuz.example/audio.flac', rgInfo: null });
        });
        api.getAmazonMusicStreamUrl = vi.fn(() => {
            calls.push('amazon');
            return Promise.resolve({
                url: 'https://amazon.example/audio.mp4',
                sourceUrl: 'https://amazon.example/audio.mp4',
                provider: 'amazon',
            });
        });

        const result = await api.getStreamUrl('71513806', 'LOSSLESS');

        expect(result.provider).toBe('qobuz');
        expect(calls).toEqual(['qobuz']);
    });

    test('falls back to Amazon when Qobuz cannot resolve a stream', async () => {
        const calls = [];
        api.getQobuzStreamUrl = vi.fn(() => {
            calls.push('qobuz');
            return Promise.resolve(null);
        });
        api.getAmazonMusicStreamUrl = vi.fn(() => {
            calls.push('amazon');
            return Promise.resolve({
                url: 'https://amazon.example/audio.mp4',
                sourceUrl: 'https://amazon.example/audio.mp4',
                provider: 'amazon',
                playbackType: 'direct',
                quality: 'HD',
                qualityDisplay: 'FLAC',
            });
        });

        const result = await api.getStreamUrl('71513806', 'LOSSLESS');

        expect(result.provider).toBe('amazon');
        expect(calls).toEqual(['qobuz', 'amazon']);
    });

    test('falls back to Deezer when neither Qobuz nor Amazon can resolve a stream', async () => {
        const calls = [];
        api.getQobuzStreamUrl = vi.fn(() => {
            calls.push('qobuz');
            return Promise.resolve(null);
        });
        api.getAmazonMusicStreamUrl = vi.fn(() => {
            calls.push('amazon');
            return Promise.resolve(null);
        });
        api.getDeezerStreamUrl = vi.fn(() => {
            calls.push('deezer');
            return Promise.resolve({ url: 'https://deezer.example/audio.flac', rgInfo: null });
        });

        const result = await api.getStreamUrl('71513806', 'LOSSLESS');

        expect(result.provider).toBe('deezer');
        expect(calls).toEqual(['qobuz', 'amazon', 'deezer']);
    });

    test('throws when no provider can resolve a stream', async () => {
        api.getQobuzStreamUrl = vi.fn(() => Promise.resolve(null));
        api.getAmazonMusicStreamUrl = vi.fn(() => Promise.resolve(null));
        api.getDeezerStreamUrl = vi.fn(() => Promise.resolve(null));

        await expect(api.getStreamUrl('71513806', 'LOSSLESS')).rejects.toThrow(
            'Could not resolve stream URL from Amazon Music, Qobuz, or Deezer'
        );
    });
});

describe('Amazon Music Turnstile auth', () => {
    let api;

    beforeEach(() => {
        api = new LosslessAPI({});
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('rejects when Turnstile execution fails', async () => {
        const turnstile = {
            render: vi.fn((_container, config) => {
                queueMicrotask(() => config['error-callback']('110500'));
                return 'widget-1';
            }),
            execute: vi.fn(),
            remove: vi.fn(),
        };
        api.loadTurnstile = vi.fn(() => Promise.resolve(turnstile));

        await expect(api.getTurnstileResponse()).rejects.toThrow('Turnstile failed');

        expect(turnstile.render).toHaveBeenCalledTimes(1);
        expect(turnstile.execute).toHaveBeenCalledWith('widget-1');
    });

    test('resolves with token on successful Turnstile execution', async () => {
        const turnstile = {
            render: vi.fn((_container, config) => {
                queueMicrotask(() => config.callback('valid-token'));
                return 'widget-1';
            }),
            execute: vi.fn(),
            remove: vi.fn(),
        };
        api.loadTurnstile = vi.fn(() => Promise.resolve(turnstile));

        await expect(api.getTurnstileResponse()).resolves.toBe('valid-token');

        expect(turnstile.render).toHaveBeenCalledTimes(1);
        expect(turnstile.execute).toHaveBeenCalledWith('widget-1');
    });
});

/*
describe('MusicAPI Amazon playback capability delegation', () => {
    test('forwards Amazon playback capability checks to the active API', async () => {
        const musicApi = new MusicAPI({});
        musicApi.tidalAPI.canPlayAmazonMusicStream = vi.fn(() => Promise.resolve(false));

        await expect(musicApi.canPlayAmazonMusicStream({ provider: 'amazon' })).resolves.toBe(false);
        expect(musicApi.tidalAPI.canPlayAmazonMusicStream).toHaveBeenCalledWith({ provider: 'amazon' });
    });
});
*/
