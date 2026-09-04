import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchMoreItems,
	getExternalLinks,
	getTrendingTV,
	isTmdbConfigured
} from '$lib/server/tmdb';

const testEnv = vi.hoisted(() => ({
	TMDB_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: testEnv }));

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const tvResult = {
	id: 123,
	name: 'Running Series',
	overview: 'A show with a recently aired episode.',
	poster_path: '/poster.jpg',
	backdrop_path: '/backdrop.jpg',
	first_air_date: '2018-04-01',
	genre_ids: [35, 10751, 999999],
	vote_average: 8.26,
	vote_count: 250,
	origin_country: ['CA']
};

function mockTmdbPages() {
	vi.mocked(fetch).mockImplementation(async (input) => {
		const url = new URL(String(input));
		const path = url.pathname;

		if (path === '/3/discover/tv' || path === '/3/discover/movie') {
			return jsonResponse({ results: url.searchParams.get('page') === '1' ? [tvResult] : [] });
		}

		if (path.endsWith('/external_ids')) {
			return jsonResponse({ imdb_id: 'tt1234567' });
		}

		if (path.endsWith('/content_ratings')) {
			return jsonResponse({ results: [{ iso_3166_1: 'US', rating: 'TV-14' }] });
		}

		if (path.endsWith('/release_dates')) {
			return jsonResponse({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }] });
		}

		return jsonResponse({ production_countries: [] });
	});
}

describe('TMDb client', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
		testEnv.TMDB_API_KEY = undefined;
		vi.stubGlobal('fetch', vi.fn());
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it('reports whether a TMDb API key is configured', () => {
		expect(isTmdbConfigured()).toBe(false);
		testEnv.TMDB_API_KEY = ' token ';
		expect(isTmdbConfigured()).toBe(true);
	});

	it('uses episode air dates for TV date ranges', async () => {
		testEnv.TMDB_API_KEY = 'token';
		mockTmdbPages();

		const items = await fetchMoreItems('trendingTV', 'CA', 'month');
		const discoverUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));

		expect(items[0]).toMatchObject({
			title: 'Running Series',
			releaseDate: '2018-04-01',
			releaseYear: '2018',
			genres: ['Comedy', 'Family'],
			certification: 'TV-14'
		});
		expect(discoverUrl.searchParams.get('air_date.gte')).toBe('2026-05-15');
		expect(discoverUrl.searchParams.get('air_date.lte')).toBe('2026-06-15');
		expect(discoverUrl.searchParams.has('first_air_date.gte')).toBe(false);
		expect(discoverUrl.searchParams.has('first_air_date.lte')).toBe(false);
	});

	it('uses an episode air-date window for the default trending TV feed', async () => {
		testEnv.TMDB_API_KEY = 'token';
		mockTmdbPages();

		await getTrendingTV('GB', 'any');
		const discoverUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));

		expect(discoverUrl.searchParams.get('air_date.gte')).toBe('2023-06-15');
		expect(discoverUrl.searchParams.get('air_date.lte')).toBe('2026-06-15');
	});

	it('keeps movie date ranges based on primary release dates', async () => {
		testEnv.TMDB_API_KEY = 'token';
		mockTmdbPages();

		await fetchMoreItems('popularMovies', 'AU', 'three_months');
		const discoverUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));

		expect(discoverUrl.searchParams.get('primary_release_date.gte')).toBe('2026-03-15');
		expect(discoverUrl.searchParams.get('primary_release_date.lte')).toBe('2026-06-15');
		expect(discoverUrl.searchParams.has('air_date.gte')).toBe(false);
	});

	it('maps external IMDb and TMDb links', async () => {
		testEnv.TMDB_API_KEY = 'token';
		vi.mocked(fetch).mockResolvedValue(jsonResponse({ imdb_id: 'tt7654321' }));

		await expect(getExternalLinks('tv', 55)).resolves.toEqual({
			tmdbUrl: 'https://www.themoviedb.org/tv/55',
			imdbUrl: 'https://www.imdb.com/title/tt7654321/'
		});
		expect(fetch).toHaveBeenCalledWith(
			'https://api.themoviedb.org/3/tv/55/external_ids?api_key=token',
			expect.anything()
		);
	});

	it('returns a TMDb link without an IMDb lookup when unconfigured', async () => {
		await expect(getExternalLinks('movie', 66)).resolves.toEqual({
			tmdbUrl: 'https://www.themoviedb.org/movie/66',
			imdbUrl: null
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('uses curated fallback titles when TMDb is unavailable', async () => {
		const items = await getTrendingTV('CA', 'any');

		expect(items.length).toBeGreaterThan(0);
		expect(items.every((item) => item.mediaType === 'tv')).toBe(true);
		expect(fetch).not.toHaveBeenCalled();
	});
});
