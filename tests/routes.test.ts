import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getLinks } from '../src/routes/api/links/+server';
import { GET as getMore } from '../src/routes/api/more/+server';
import { GET as getStatus } from '../src/routes/api/status/+server';
import { POST as postRequest } from '../src/routes/api/request/+server';
import { load } from '../src/routes/+page.server';
import { OverseerrMediaStatus, type DiscoverResponse } from '$lib/types';

const testEnv = vi.hoisted(() => ({
	TMDB_API_KEY: undefined as string | undefined,
	OVERSEERR_URL: undefined as string | undefined,
	OVERSEERR_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: testEnv }));

describe('API routes', () => {
	beforeEach(() => {
		testEnv.TMDB_API_KEY = undefined;
		testEnv.OVERSEERR_URL = undefined;
		testEnv.OVERSEERR_API_KEY = undefined;
		vi.stubGlobal('fetch', vi.fn());
	});

	it('validates link requests and returns fallback links without TMDb', async () => {
		const invalid = await getLinks({ url: new URL('http://localhost/api/links') } as never);
		expect(invalid.status).toBe(400);

		const valid = await getLinks({
			url: new URL('http://localhost/api/links?mediaType=tv&tmdbId=123')
		} as never);
		expect(valid.status).toBe(200);
		expect(await valid.json()).toEqual({
			tmdbUrl: 'https://www.themoviedb.org/tv/123',
			imdbUrl: null
		});
	});

	it('validates status requests and reports unconfigured Overseerr', async () => {
		const invalid = await getStatus({ url: new URL('http://localhost/api/status?mediaType=podcast&tmdbId=1') } as never);
		expect(invalid.status).toBe(400);

		const valid = await getStatus({ url: new URL('http://localhost/api/status?mediaType=movie&tmdbId=1') } as never);
		expect(valid.status).toBe(200);
		expect(await valid.json()).toEqual({ status: OverseerrMediaStatus.UNKNOWN, configured: false });
	});

	it('validates more requests and returns no items without TMDb', async () => {
		const invalid = await getMore({
			url: new URL('http://localhost/api/more?category=unknown&country=CA&range=month')
		} as never);
		expect(invalid.status).toBe(400);

		const valid = await getMore({
			url: new URL('http://localhost/api/more?category=trendingTV&country=CA&range=month')
		} as never);
		expect(valid.status).toBe(200);
		expect(await valid.json()).toEqual({ items: [] });
	});

	it('rejects invalid request payloads and unconfigured media requests', async () => {
		const invalid = await postRequest({
			request: new Request('http://localhost/api/request', {
				method: 'POST',
				body: JSON.stringify({ mediaId: '1', mediaType: 'tv' })
			})
		} as never);
		expect(invalid.status).toBe(400);

		const valid = await postRequest({
			request: new Request('http://localhost/api/request', {
				method: 'POST',
				body: JSON.stringify({ mediaId: 1, mediaType: 'movie' })
			})
		} as never);
		expect(valid.status).toBe(400);
		expect(await valid.json()).toMatchObject({ success: false });
	});

	it('returns a 500 response for malformed JSON request bodies', async () => {
		const response = await postRequest({
			request: new Request('http://localhost/api/request', {
				method: 'POST',
				body: '{not-json'
			})
		} as never);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			success: false,
			error: 'Internal server error while processing request.'
		});
	});
});

describe('page server load', () => {
	beforeEach(() => {
		testEnv.TMDB_API_KEY = undefined;
		testEnv.OVERSEERR_URL = undefined;
		testEnv.OVERSEERR_API_KEY = undefined;
	});

	it('uses the default country and date range', async () => {
		const data = await load({ url: new URL('http://localhost/') } as Parameters<typeof load>[0]) as DiscoverResponse;

		expect(data.country).toBe('ALL');
		expect(data.dateRange).toBe('any');
		expect(data.countryInfo).toEqual({ code: 'ALL', name: 'All Non-US', flag: '🌐' });
		expect(data.tmdbConfigured).toBe(false);
		expect(data.overseerrConfigured).toBe(false);
		expect(data.trendingTV.length).toBeGreaterThan(0);
	});

	it('accepts valid filters and falls back from invalid filters', async () => {
		const valid = await load({
			url: new URL('http://localhost/?country=ca&range=month')
		} as Parameters<typeof load>[0]) as DiscoverResponse;
		expect(valid.country).toBe('CA');
		expect(valid.dateRange).toBe('month');
		expect(valid.countryInfo.name).toBe('Canada');

		const invalid = await load({
			url: new URL('http://localhost/?country=US&range=tomorrow')
		} as Parameters<typeof load>[0]) as DiscoverResponse;
		expect(invalid.country).toBe('ALL');
		expect(invalid.dateRange).toBe('any');
	});
});
