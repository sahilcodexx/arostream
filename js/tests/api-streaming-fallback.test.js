import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../utils.js', () => ({
    RATE_LIMIT_ERROR_MESSAGE: 'rate limited',
    deriveTrackQuality: vi.fn(),
    delay: vi.fn(() => Promise.resolve()),
    isTrackUnavailable: vi.fn(() => false),
    getExtensionFromBlob: vi.fn(),
    getTrackDiscNumber: vi.fn(),
    normalizeQualityToken: vi.fn((quality) => quality),
    getTrackCoverId: vi.fn(),
    getCoverBlob: vi.fn(),
}));

vi.mock('../storage.js', () => ({
    preferDolbyAtmosSettings: { isEnabled: vi.fn(() => false) },
    trackDateSettings: { useAlbumYear: vi.fn(() => false) },
    devModeSettings: { isEnabled: vi.fn(() => false), getUrl: vi.fn(() => '') },
    amazonMusicSettings: { isEnabled: vi.fn(() => false) },
    deezerFallbackSettings: { isEnabled: vi.fn(() => false), getApiBaseUrl: vi.fn(() => '') },
}));

vi.mock('../cache.js', () => ({
    APICache: class {
        async get() {
            return null;
        }
        async set() {}
        async clearExpired() {}
    },
}));

vi.mock('../dash-downloader.ts', () => ({ DashDownloader: class {} }));
vi.mock('../hls-downloader.js', () => ({ HlsDownloader: class {} }));
vi.mock('../proxy-utils.js', () => ({ getProxyUrl: vi.fn((url) => url), wrapTidalUrl: vi.fn((url) => url) }));
vi.mock('../ffmpeg.js', () => ({ loadFfmpeg: vi.fn(), FfmpegError: class extends Error {}, ffmpeg: vi.fn() }));
vi.mock('../download-utils.ts', () => ({ triggerDownload: vi.fn(), applyAudioPostProcessing: vi.fn() }));
vi.mock('../ffmpegFormats.ts', () => ({ isCustomFormat: vi.fn(() => false) }));
vi.mock('../progressEvents.js', () => ({ DownloadProgress: class {} }));
vi.mock('../readableStreamIterator.js', () => ({ readableStreamIterator: vi.fn() }));
vi.mock('../HiFi.ts', () => ({
    HiFiClient: { instance: { query: vi.fn() } },
    TidalResponse: class {},
}));
vi.mock('../platform-detection.js', () => ({
    isIos: false,
    isSafari: false,
    isChrome: true,
    canUseNativeAmazonCenc: true,
}));
vi.mock('../container-classes.js', () => ({
    TrackAlbum: class {},
    EnrichedAlbum: class {},
    EnrichedTrack: class {},
    ReplayGain: class {},
    PlaybackInfo: class {
        constructor(value) {
            Object.assign(this, value);
        }
    },
    Track: class {},
    Album: class {},
    PreparedVideo: class {},
    PreparedTrack: class {},
}));

const { LosslessAPI } = await import('../api.js');

describe('LosslessAPI streaming fallback', () => {
    let settings;
    let api;

    beforeEach(() => {
        settings = {
            getInstances: vi.fn(async (type) => (type === 'streaming' ? [{ url: 'https://hifi.example' }] : [])),
        };
        api = new LosslessAPI(settings);
        vi.spyOn(api, 'getTrackMetadata').mockResolvedValue({ id: '123', isrc: 'TESTISRC123' });
        vi.spyOn(api, 'getAmazonMusicStreamUrl').mockResolvedValue(null);
        vi.spyOn(api, 'getQobuzStreamUrl').mockResolvedValue(null);
        vi.spyOn(api, 'getDeezerStreamUrl').mockResolvedValue(null);
    });

    test('uses Amazon Music when Qobuz returns no URL and Amazon resolves', async () => {
        api.getAmazonMusicStreamUrl.mockResolvedValue({
            url: 'blob:https://app.example/amazon',
            provider: 'amazon',
            playbackType: 'direct',
            quality: 'HD_44',
            rgInfo: {
                trackReplayGain: 0,
                trackPeakAmplitude: 1,
                albumReplayGain: 0,
                albumPeakAmplitude: 1,
            },
        });

        const result = await api.getStreamUrl('123', 'LOSSLESS');

        expect(result).toMatchObject({
            url: 'blob:https://app.example/amazon',
            provider: 'amazon',
            playbackType: 'direct',
            quality: 'HD_44',
            rgInfo: {
                trackReplayGain: 0,
                trackPeakAmplitude: 1,
                albumReplayGain: 0,
                albumPeakAmplitude: 1,
            },
        });
        expect(api.getQobuzStreamUrl).toHaveBeenCalledWith('TESTISRC123', 'LOSSLESS');
        expect(api.getDeezerStreamUrl).not.toHaveBeenCalled();
    });

    test('uses Qobuz when it resolves a stream URL', async () => {
        api.getQobuzStreamUrl.mockResolvedValue({
            url: 'https://audio.example/qobuz.flac',
            rgInfo: {
                trackReplayGain: -2,
                trackPeakAmplitude: 0.8,
                albumReplayGain: -3,
                albumPeakAmplitude: 0.85,
            },
        });

        const result = await api.getStreamUrl('123', 'LOSSLESS');

        expect(result.url).toBe('https://audio.example/qobuz.flac');
        expect(result.provider).toBe('qobuz');
        expect(api.getAmazonMusicStreamUrl).not.toHaveBeenCalled();
    });

    test('uses Deezer when Qobuz and Amazon both return no URL', async () => {
        api.getDeezerStreamUrl.mockResolvedValue({
            url: 'https://audio.example/deezer.flac',
            format: 'flac',
        });

        const result = await api.getStreamUrl('123', 'LOSSLESS');

        expect(result.url).toBe('https://audio.example/deezer.flac');
        expect(result.provider).toBe('deezer');
        expect(api.getQobuzStreamUrl).toHaveBeenCalledWith('TESTISRC123', 'LOSSLESS');
        expect(api.getAmazonMusicStreamUrl).toHaveBeenCalledWith('123', 'LOSSLESS', expect.any(Object));
    });

    test('throws when no provider resolves a stream URL', async () => {
        settings.getInstances.mockResolvedValue([]);

        await expect(api.getStreamUrl('123', 'LOSSLESS')).rejects.toThrow(
            'Could not resolve stream URL from Amazon Music, Qobuz, or Deezer'
        );
    });
});
