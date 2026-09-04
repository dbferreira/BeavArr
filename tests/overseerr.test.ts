import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMediaStatus, isOverseerrConfigured, requestMedia } from '$lib/server/overseerr';
import { OverseerrMediaStatus } from '$lib/types';

const testEnv = vi.hoisted(() => ({
	OVERSEERR_URL: undefined as string | undefined,
	OVERSEERR_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: testEnv }));

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('Overseerr client', () => {
	beforeEach(() => {
		testEnv.OVERSEERR_URL = undefined;
		testEnv.OVERSEERR_API_KEY = undefined;
		vi.stubGlobal('fetch', vi.fn());
	});

	it('reports configuration only when both credentials are present', () => {
		expect(isOverseerrConfigured()).toBe(false);

		testEnv.OVERSEERR_URL = ' http://overseerr.local/ ';
		expect(isOverseerrConfigured()).toBe(false);

		testEnv.OVERSEERR_API_KEY = ' key ';
		expect(isOverseerrConfigured()).toBe(true);
	});

	it('returns unknown without making a request when unconfigured', async () => {
		const result = await getMediaStatus('tv', 42);

		expect(result).toEqual({ status: OverseerrMediaStatus.UNKNOWN });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('reads media status and sends the expected headers', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local///';
		testEnv.OVERSEERR_API_KEY = 'secret';
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ mediaInfo: { status: OverseerrMediaStatus.AVAILABLE } }));

		const result = await getMediaStatus('movie', 42);

		expect(result).toEqual({
			status: OverseerrMediaStatus.AVAILABLE,
			raw: { status: OverseerrMediaStatus.AVAILABLE }
		});
		expect(fetch).toHaveBeenCalledWith('http://overseerr.local/api/v1/movie/42', expect.objectContaining({
			headers: { 'X-Api-Key': 'secret', Accept: 'application/json' }
		}));
	});

	it('handles missing, not-found, failed, and malformed status responses', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local';
		testEnv.OVERSEERR_API_KEY = 'secret';

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 200));
		expect(await getMediaStatus('tv', 1)).toEqual({ status: OverseerrMediaStatus.UNKNOWN, raw: {} });

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 404));
		expect(await getMediaStatus('tv', 2)).toEqual({ status: OverseerrMediaStatus.UNKNOWN });

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 503));
		expect(await getMediaStatus('tv', 3)).toEqual({ status: OverseerrMediaStatus.UNKNOWN });

		vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
		expect(await getMediaStatus('tv', 4)).toEqual({ status: OverseerrMediaStatus.UNKNOWN });
	});

	it('rejects media requests when unconfigured', async () => {
		await expect(requestMedia({ mediaId: 7, mediaType: 'movie' })).resolves.toEqual({
			success: false,
			error: 'Overseerr is not configured. Please set OVERSEERR_URL and OVERSEERR_API_KEY in your environment.'
		});
	});

	it('submits TV requests with all seasons by default', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local/';
		testEnv.OVERSEERR_API_KEY = 'secret';
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 201));

		await expect(requestMedia({ mediaId: 7, mediaType: 'tv' })).resolves.toEqual({
			success: true,
			status: OverseerrMediaStatus.PENDING,
			message: 'Request successfully submitted to Overseerr!'
		});
		expect(fetch).toHaveBeenCalledWith('http://overseerr.local/api/v1/request', expect.objectContaining({
			method: 'POST',
			body: JSON.stringify({ mediaId: 7, mediaType: 'tv', seasons: 'all' })
		}));
	});

	it('submits movie requests without a seasons field', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local';
		testEnv.OVERSEERR_API_KEY = 'secret';
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 200));

		await requestMedia({ mediaId: 8, mediaType: 'movie', seasons: [1, 2] });

		expect(fetch).toHaveBeenCalledWith('http://overseerr.local/api/v1/request', expect.objectContaining({
			body: JSON.stringify({ mediaId: 8, mediaType: 'movie' })
		}));
	});

	it('treats conflicts as successful duplicate requests', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local';
		testEnv.OVERSEERR_API_KEY = 'secret';
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 409));

		await expect(requestMedia({ mediaId: 9, mediaType: 'tv', seasons: [3] })).resolves.toEqual({
			success: true,
			status: OverseerrMediaStatus.PENDING,
			message: 'Item has already been requested in Overseerr.'
		});
	});

	it('returns API errors and handles request failures', async () => {
		testEnv.OVERSEERR_URL = 'http://overseerr.local';
		testEnv.OVERSEERR_API_KEY = 'secret';

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: 'Bad request' }, 400));
		await expect(requestMedia({ mediaId: 1, mediaType: 'movie' })).resolves.toEqual({ success: false, error: 'Bad request' });

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'Denied' }, 403));
		await expect(requestMedia({ mediaId: 2, mediaType: 'movie' })).resolves.toEqual({ success: false, error: 'Denied' });

		vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
		await expect(requestMedia({ mediaId: 3, mediaType: 'movie' })).resolves.toEqual({
			success: false,
			error: 'Could not connect to Overseerr. Please verify network connectivity and OVERSEERR_URL.'
		});
	});
});
