import { env } from '$env/dynamic/private';
import { LRUCache } from 'lru-cache';
import type { CountryCode, DateRangeFilter, MediaItem } from '$lib/types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const TMDB_GENRES: Record<'movie' | 'tv', Record<number, string>> = {
	movie: {
		28: 'Action',
		12: 'Adventure',
		16: 'Animation',
		35: 'Comedy',
		80: 'Crime',
		99: 'Documentary',
		18: 'Drama',
		10751: 'Family',
		14: 'Fantasy',
		36: 'History',
		27: 'Horror',
		10402: 'Music',
		9648: 'Mystery',
		10749: 'Romance',
		878: 'Science Fiction',
		10770: 'TV Movie',
		53: 'Thriller',
		10752: 'War',
		37: 'Western'
	},
	tv: {
		10759: 'Action & Adventure',
		16: 'Animation',
		35: 'Comedy',
		80: 'Crime',
		99: 'Documentary',
		18: 'Drama',
		10751: 'Family',
		10762: 'Kids',
		9648: 'Mystery',
		10763: 'News',
		10764: 'Reality',
		10765: 'Sci-Fi & Fantasy',
		10766: 'Soap',
		10767: 'Talk',
		10768: 'War & Politics',
		37: 'Western'
	}
};

// 6-hour TTL in-memory LRU cache as per design doc
const tmdbCache = new LRUCache<string, MediaItem[]>({
	max: 300,
	ttl: 1000 * 60 * 60 * 6 // 6 hours in ms
});

// Long-lived cache of production country ISO codes keyed by "{mediaType}_{id}".
// Used to exclude US-dominant co-productions that TMDb's discover filter can't drop.
const countryCache = new LRUCache<string, string[]>({
	max: 5000,
	ttl: 1000 * 60 * 60 * 24 // 24 hours
});

// Long-lived cache of age certifications (e.g. "R", "PG-13", "TV-MA") keyed by "{mediaType}_{id}".
// An empty string is cached to represent "no rating available".
const certCache = new LRUCache<string, string>({
	max: 5000,
	ttl: 1000 * 60 * 60 * 24 // 24 hours
});

function getDateYearsAgo(years: number): string {
	const d = new Date();
	d.setFullYear(d.getFullYear() - years);
	return d.toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d.toISOString().split('T')[0];
}

function getDateMonthsAgo(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() - months);
	return d.toISOString().split('T')[0];
}

function getDateRangeStart(dateRange: DateRangeFilter): string | null {
	switch (dateRange) {
		case 'week':
			return getDateDaysAgo(7);
		case 'month':
			return getDateMonthsAgo(1);
		case 'three_months':
			return getDateMonthsAgo(3);
		case 'six_months':
			return getDateMonthsAgo(6);
		case 'year':
			return getDateYearsAgo(1);
		case 'any':
		default:
			return null;
	}
}

function getTmdbOriginCountryParam(country: CountryCode): string {
	if (country === 'ALL') {
		// All Non-US English media markets
		return 'CA|GB|AU|NZ|ZA|IE|NG|JM|KE|IN|GH|SG|MT';
	}
	if (country === 'ROW') {
		// Prominent English-language producing nations outside US, CA, GB, AU, NZ
		return 'ZA|IE|NG|JM|KE|IN|GH|SG|MT';
	}
	return country;
}

interface RawTmdbItem {
	id: number;
	title?: string;
	name?: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date?: string;
	first_air_date?: string;
	vote_average: number;
	vote_count: number;
	origin_country?: string[];
	genre_ids?: number[];
}

function getGenreNames(mediaType: 'movie' | 'tv', genreIds: number[] = []): string[] {
	return genreIds
		.map((id) => TMDB_GENRES[mediaType][id])
		.filter((genre): genre is string => Boolean(genre));
}

function transformTmdbItem(item: RawTmdbItem, mediaType: 'movie' | 'tv', defaultCountry: CountryCode): MediaItem {
	const rawDate = (mediaType === 'movie' ? item.release_date : item.first_air_date) || '';
	const releaseYear = rawDate.length >= 4 ? rawDate.slice(0, 4) : 'N/A';

	return {
		id: item.id,
		title: (mediaType === 'movie' ? item.title : item.name) || 'Untitled',
		overview: item.overview || 'No synopsis available.',
		posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
		backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
		mediaType,
		releaseDate: rawDate,
		releaseYear,
		voteAverage: Math.round((item.vote_average || 0) * 10) / 10,
		voteCount: item.vote_count || 0,
		genres: getGenreNames(mediaType, item.genre_ids),
		originCountry: item.origin_country && item.origin_country.length > 0
			? item.origin_country
			: [defaultCountry === 'ROW' || defaultCountry === 'ALL' ? 'GLOBAL' : defaultCountry]
	};
}

async function fetchFromTmdb(endpoint: string, params: Record<string, string>): Promise<RawTmdbItem[]> {
	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return [];
	}

	const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
	const isBearer = apiKey.startsWith('ey') || apiKey.length > 40;

	if (!isBearer) {
		url.searchParams.set('api_key', apiKey);
	}

	for (const [key, val] of Object.entries(params)) {
		url.searchParams.set(key, val);
	}

	const headers: Record<string, string> = {
		'Accept': 'application/json'
	};

	if (isBearer) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

	try {
		const res = await fetch(url.toString(), {
			headers,
			signal: AbortSignal.timeout(8000)
		});

		if (!res.ok) {
			console.error(`[TMDb] API request failed (${res.status} ${res.statusText}): ${endpoint}`);
			return [];
		}

		const data = await res.json();
		return data.results || [];
	} catch (err) {
		console.error(`[TMDb] Network or timeout error fetching ${endpoint}:`, err);
		return [];
	}
}

/**
 * Fetch a single TMDb resource (e.g. /movie/{id}) and return its JSON body, or null on failure.
 */
async function fetchTmdbDetail(endpoint: string): Promise<Record<string, unknown> | null> {
	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return null;
	}

	const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
	const isBearer = apiKey.startsWith('ey') || apiKey.length > 40;

	if (!isBearer) {
		url.searchParams.set('api_key', apiKey);
	}

	const headers: Record<string, string> = {
		'Accept': 'application/json'
	};

	if (isBearer) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

	try {
		const res = await fetch(url.toString(), {
			headers,
			signal: AbortSignal.timeout(8000)
		});

		if (!res.ok) {
			return null;
		}

		return await res.json();
	} catch {
		return null;
	}
}

/**
 * Resolve the ISO 3166-1 production country codes for a given title, cached for 24h.
 */
async function getProductionCountryCodes(mediaType: 'movie' | 'tv', id: number): Promise<string[]> {
	const key = `${mediaType}_${id}`;
	const cached = countryCache.get(key);
	if (cached) return cached;

	const detail = await fetchTmdbDetail(`/${mediaType}/${id}`);
	const productionCountries = (detail?.production_countries as Array<{ iso_3166_1?: string }> | undefined) ?? [];
	const codes = productionCountries.map((c) => c.iso_3166_1).filter((c): c is string => Boolean(c));

	countryCache.set(key, codes);
	return codes;
}

/**
 * Resolve the age certification for a title, preferring the US rating with a
 * fallback to the first non-empty certification from any country. Cached for 24h.
 * - Movies: /movie/{id}/release_dates -> release_dates[].certification
 * - TV:     /tv/{id}/content_ratings  -> results[].rating
 */
async function getCertification(mediaType: 'movie' | 'tv', id: number): Promise<string | null> {
	const key = `${mediaType}_${id}`;
	const cached = certCache.get(key);
	if (cached !== undefined) return cached || null;

	let value: string | null = null;

	if (mediaType === 'movie') {
		const data = await fetchTmdbDetail(`/movie/${id}/release_dates`);
		const results = (data?.results as Array<{ iso_3166_1: string; release_dates: Array<{ certification?: string }> }> | undefined) ?? [];
		const us = results.find((r) => r.iso_3166_1 === 'US');
		for (const entry of us ? [us, ...results] : results) {
			const cert = (entry.release_dates ?? []).find((rd) => (rd.certification ?? '').trim());
			if (cert && cert.certification) {
				value = cert.certification.trim();
				break;
			}
		}
	} else {
		const data = await fetchTmdbDetail(`/tv/${id}/content_ratings`);
		const results = (data?.results as Array<{ iso_3166_1: string; rating?: string }> | undefined) ?? [];
		const us = results.find((r) => r.iso_3166_1 === 'US');
		for (const entry of us ? [us, ...results] : results) {
			const rating = (entry.rating ?? '').trim();
			if (rating) {
				value = rating;
				break;
			}
		}
	}

	certCache.set(key, value ?? '');
	return value;
}

/**
 * Attach a resolved age certification to each item, in parallel.
 */
async function enrichCertifications(items: MediaItem[]): Promise<MediaItem[]> {
	return Promise.all(
		items.map(async (item) => ({
			...item,
			certification: await getCertification(item.mediaType, item.id)
		}))
	);
}

/**
 * Drop any title whose production countries include the US. TMDb's discover
 * `with_origin_country` matches on ANY production country, so US-dominant
 * co-productions (e.g. "Civil War") would otherwise leak into the non-US feed.
 * Titles whose production countries can't be resolved are kept (fail-open).
 */
async function filterOutUsProductions(items: RawTmdbItem[], mediaType: 'movie' | 'tv'): Promise<RawTmdbItem[]> {
	const results = await Promise.all(
		items.map(async (item) => {
			const codes = await getProductionCountryCodes(mediaType, item.id);
			if (codes.length === 0) return item;
			return codes.includes('US') ? null : item;
		})
	);
	return results.filter((x): x is RawTmdbItem => x !== null);
}

export type Category = 'trendingTV' | 'acclaimedTV' | 'popularMovies' | 'acclaimedMovies';

const PAGE_SIZE = 20;

// Tracks the next TMDb discover page to fetch for each category + country so that
// "load more" calls return a fresh, non-overlapping batch.
const discoverCursors = new Map<string, number>();
function cursorKey(category: Category, country: CountryCode, dateRange: DateRangeFilter): string {
	return `${category}_${country}_${dateRange}`;
}

function getCategoryConfig(category: Category, country: CountryCode, dateRange: DateRangeFilter): {
	endpoint: string;
	mediaType: 'movie' | 'tv';
	params: Record<string, string>;
} {
	const origin = getTmdbOriginCountryParam(country);
	const rangeStart = getDateRangeStart(dateRange);
	const today = new Date().toISOString().split('T')[0];
	const tvDateParams: Record<string, string> = rangeStart
		? {
				'air_date.gte': rangeStart,
				'air_date.lte': today
			}
		: {};
	const movieDateParams: Record<string, string> = rangeStart
		? {
				'primary_release_date.gte': rangeStart,
				'primary_release_date.lte': today
			}
		: {};
	switch (category) {
		case 'trendingTV':
			return {
				endpoint: '/discover/tv',
				mediaType: 'tv',
				params: {
					with_origin_country: origin,
					with_original_language: 'en',
					include_adult: 'false',
					sort_by: 'popularity.desc',
					...(rangeStart
						? tvDateParams
						: { 'air_date.gte': getDateYearsAgo(3), 'air_date.lte': today }),
					'vote_count.gte': '5'
				}
			};
		case 'acclaimedTV':
			return {
				endpoint: '/discover/tv',
				mediaType: 'tv',
				params: {
					with_origin_country: origin,
					with_original_language: 'en',
					include_adult: 'false',
					sort_by: 'vote_average.desc',
					...tvDateParams,
					'vote_count.gte': '50'
				}
			};
		case 'popularMovies':
			return {
				endpoint: '/discover/movie',
				mediaType: 'movie',
				params: {
					with_origin_country: origin,
					with_original_language: 'en',
					include_adult: 'false',
					sort_by: 'popularity.desc',
					...(rangeStart ? movieDateParams : { 'primary_release_date.gte': getDateYearsAgo(3) }),
					'vote_count.gte': '5'
				}
			};
		case 'acclaimedMovies':
			return {
				endpoint: '/discover/movie',
				mediaType: 'movie',
				params: {
					with_origin_country: origin,
					with_original_language: 'en',
					include_adult: 'false',
					sort_by: 'vote_average.desc',
					...movieDateParams,
					'vote_count.gte': '50'
				}
			};
	}
}

/**
 * Fetch the next batch of non-US titles for a category + country, advancing an
 * in-memory discover cursor so subsequent calls return fresh pages. Returns up
 * to PAGE_SIZE items.
 */
export async function fetchMoreItems(category: Category, country: CountryCode, dateRange: DateRangeFilter): Promise<MediaItem[]> {
	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return [];
	}

	const { endpoint, mediaType, params } = getCategoryConfig(category, country, dateRange);
	const key = cursorKey(category, country, dateRange);
	let page = discoverCursors.get(key) ?? 1;

	const collected: RawTmdbItem[] = [];
	const maxPages = 10;
	while (collected.length < PAGE_SIZE && page <= maxPages) {
		const batch = await fetchFromTmdb(endpoint, { ...params, page: String(page) });
		if (batch.length === 0) break;
		const nonUS = await filterOutUsProductions(batch, mediaType);
		collected.push(...nonUS);
		page++;
	}
	discoverCursors.set(key, page);

	const items = collected.slice(0, PAGE_SIZE).map((item) => transformTmdbItem(item, mediaType, country));
	return enrichCertifications(items);
}

function filterByDateRange(items: MediaItem[], dateRange: DateRangeFilter): MediaItem[] {
	const rangeStart = getDateRangeStart(dateRange);
	if (!rangeStart) return items;
	const today = new Date().toISOString().split('T')[0];
	return items.filter((item) => item.releaseDate >= rangeStart && item.releaseDate <= today);
}

/**
 * Trending TV Series
 * sort_by=popularity.desc, air_date.gte=[Date 3 years ago], vote_count.gte=5
 */
export async function getTrendingTV(country: CountryCode, dateRange: DateRangeFilter): Promise<MediaItem[]> {
	const cacheKey = `trending_tv_${country}_${dateRange}`;
	const cached = tmdbCache.get(cacheKey);
	if (cached) return cached;

	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return filterByDateRange(getMockTrendingTV(country), dateRange);
	}

	const items = await fetchMoreItems('trendingTV', country, dateRange);
	if (items.length === 0) {
		return filterByDateRange(getMockTrendingTV(country), dateRange);
	}

	tmdbCache.set(cacheKey, items);
	return items;
}

/**
 * Critically Acclaimed TV Series
 * sort_by=vote_average.desc, vote_count.gte=50
 */
export async function getCriticallyAcclaimedTV(country: CountryCode, dateRange: DateRangeFilter): Promise<MediaItem[]> {
	const cacheKey = `acclaimed_tv_${country}_${dateRange}`;
	const cached = tmdbCache.get(cacheKey);
	if (cached) return cached;

	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return filterByDateRange(getMockAcclaimedTV(country), dateRange);
	}

	const items = await fetchMoreItems('acclaimedTV', country, dateRange);
	if (items.length === 0) {
		return filterByDateRange(getMockAcclaimedTV(country), dateRange);
	}

	tmdbCache.set(cacheKey, items);
	return items;
}

/**
 * Popular Movies
 * sort_by=popularity.desc, primary_release_date.gte=[Date 3 years ago], vote_count.gte=5
 */
export async function getPopularMovies(country: CountryCode, dateRange: DateRangeFilter): Promise<MediaItem[]> {
	const cacheKey = `popular_movies_${country}_${dateRange}`;
	const cached = tmdbCache.get(cacheKey);
	if (cached) return cached;

	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return filterByDateRange(getMockPopularMovies(country), dateRange);
	}

	const items = await fetchMoreItems('popularMovies', country, dateRange);
	if (items.length === 0) {
		return filterByDateRange(getMockPopularMovies(country), dateRange);
	}

	tmdbCache.set(cacheKey, items);
	return items;
}

/**
 * Critically Acclaimed Movies
 * sort_by=vote_average.desc, vote_count.gte=50
 */
export async function getCriticallyAcclaimedMovies(country: CountryCode, dateRange: DateRangeFilter): Promise<MediaItem[]> {
	const cacheKey = `acclaimed_movies_${country}_${dateRange}`;
	const cached = tmdbCache.get(cacheKey);
	if (cached) return cached;

	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return filterByDateRange(getMockAcclaimedMovies(country), dateRange);
	}

	const items = await fetchMoreItems('acclaimedMovies', country, dateRange);
	if (items.length === 0) {
		return filterByDateRange(getMockAcclaimedMovies(country), dateRange);
	}

	tmdbCache.set(cacheKey, items);
	return items;
}

/**
 * Fetch external links for a title (TMDb always, IMDb when available).
 */
export async function getExternalLinks(mediaType: 'movie' | 'tv', tmdbId: number): Promise<{ tmdbUrl: string; imdbUrl: string | null }> {
	const tmdbUrl = `https://www.themoviedb.org/${mediaType}/${tmdbId}`;
	const apiKey = env.TMDB_API_KEY?.trim();
	if (!apiKey) {
		return { tmdbUrl, imdbUrl: null };
	}

	const data = await fetchTmdbDetail(`/${mediaType}/${tmdbId}/external_ids`);
	const imdbId = typeof data?.imdb_id === 'string' ? data.imdb_id.trim() : '';

	return {
		tmdbUrl,
		imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null
	};
}

export function isTmdbConfigured(): boolean {
	return Boolean(env.TMDB_API_KEY && env.TMDB_API_KEY.trim().length > 0);
}

// Curated high quality demo fallbacks when TMDb key is not yet set
function getMockTrendingTV(country: CountryCode): MediaItem[] {
	const baseMocks: Record<Exclude<CountryCode, 'ALL'>, MediaItem[]> = {
		CA: [
			{
				id: 86526,
				title: 'Sort Of',
				overview: 'Follows Sabi Mehboob, a fluid, millennial child of Pakistani parents, who straddles various identities in Toronto.',
				posterPath: 'https://image.tmdb.org/t/p/w500/i5YkR8eF6sK7qX9uHq2XmX2vQyM.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/8tE6L8u9KzJ9iV7F4sH6l5qR3W.jpg',
				mediaType: 'tv',
				releaseDate: '2021-10-05',
				releaseYear: '2021',
				voteAverage: 7.8,
				voteCount: 42,
				originCountry: ['CA']
			},
			{
				id: 111803,
				title: 'Son of a Critch',
				overview: 'A heartfelt window into the life of a child growing up in Newfoundland in the late 1980s.',
				posterPath: 'https://image.tmdb.org/t/p/w500/bC4vJ3vV6c9i4k2L5m2m9gJk8mK.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2022-01-04',
				releaseYear: '2022',
				voteAverage: 8.2,
				voteCount: 38,
				originCountry: ['CA']
			},
			{
				id: 106379,
				title: 'Transplant',
				overview: 'An exceptional Syrian doctor with emergency medicine skills flees his country and starts fresh in Canada.',
				posterPath: 'https://image.tmdb.org/t/p/w500/yHkZpB9w8mH7Hq8qY7Kq3b2V9l.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2020-02-26',
				releaseYear: '2020',
				voteAverage: 8.1,
				voteCount: 195,
				originCountry: ['CA']
			}
		],
		GB: [
			{
				id: 110492,
				title: 'Slow Horses',
				overview: 'Follows a dysfunctional team of MI5 agents and their obnoxious boss, the notorious Jackson Lamb, as they navigate the espionage world.',
				posterPath: 'https://image.tmdb.org/t/p/w500/98N1vQj2W2r2A3B4C5D6E7F8G9.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1z9qKz7K2XQ.jpg',
				mediaType: 'tv',
				releaseDate: '2022-04-01',
				releaseYear: '2022',
				voteAverage: 8.3,
				voteCount: 680,
				originCountry: ['GB']
			},
			{
				id: 202250,
				title: 'Baby Reindeer',
				overview: 'When a struggling comedian shows one act of kindness to a vulnerable woman, it sparks a suffocating obsession.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4mHwT5c6mP3gK9k7q8L9M0n1o2.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2024-04-11',
				releaseYear: '2024',
				voteAverage: 7.9,
				voteCount: 840,
				originCountry: ['GB']
			}
		],
		AU: [
			{
				id: 82728,
				title: 'Bluey',
				overview: 'Bluey is an inexhaustible six-year-old Blue Heeler dog, who turns everyday family life into extraordinary adventures.',
				posterPath: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/1aabn6M3N2fQ8v5F0H4P4n5L.jpg',
				mediaType: 'tv',
				releaseDate: '2018-10-01',
				releaseYear: '2018',
				voteAverage: 9.0,
				voteCount: 420,
				originCountry: ['AU']
			},
			{
				id: 135848,
				title: 'Heartbreak High',
				overview: 'A discovery of an illicit map at Hartley High forces its students into sexual education classes amidst drama and chaos.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5u2tB1S4a9p0lM1K3j8V5c2W7z.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2022-09-14',
				releaseYear: '2022',
				voteAverage: 8.0,
				voteCount: 310,
				originCountry: ['AU']
			}
		],
		NZ: [
			{
				id: 81056,
				title: 'Wellington Paranormal',
				overview: 'Officers Minogue and O\'Leary investigate supernatural phenomena around the greater Wellington capital area.',
				posterPath: 'https://image.tmdb.org/t/p/w500/2Lh6U7k4h1m8f2a9D5k8g4H.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2018-07-11',
				releaseYear: '2018',
				voteAverage: 7.6,
				voteCount: 165,
				originCountry: ['NZ']
			},
			{
				id: 213233,
				title: 'Creamerie',
				overview: 'In a post-viral world where a plague has wiped out 99% of men, three women running an organic dairy farm stumble upon a surviving male.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7aB4c3D2e1F0g9H8i7J6k5L4M3.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2021-04-19',
				releaseYear: '2021',
				voteAverage: 7.2,
				voteCount: 32,
				originCountry: ['NZ']
			}
		],
		ZA: [
			{
				id: 102903,
				title: 'Blood & Water',
				overview: 'After crossing paths at a party, a Cape Town teen sets out to prove whether a private-school swimming star is her abducted-at-birth sister.',
				posterPath: 'https://image.tmdb.org/t/p/w500/98vj7kL0zW7j9P8q6v3b1a2c.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2020-05-20',
				releaseYear: '2020',
				voteAverage: 7.6,
				voteCount: 180,
				originCountry: ['ZA']
			},
			{
				id: 215424,
				title: 'Spinners',
				overview: 'Ethan, a 17-year-old driver working for a local gang in Cape Town, discovers a way out through spinning, an extreme motorsport.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4z9kL8m1n0p2q3r4s5t6u7v8.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2023-11-08',
				releaseYear: '2023',
				voteAverage: 8.0,
				voteCount: 45,
				originCountry: ['ZA']
			}
		],
		IE: [
			{
				id: 132470,
				title: 'Kin',
				overview: 'A Dublin family embroiled in a gangland war against an international cartel faces impossible odds as the ties that bind them are tested.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7k9m1n0p2q3r4s5t6u7v8w9x.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2021-09-09',
				releaseYear: '2021',
				voteAverage: 7.9,
				voteCount: 210,
				originCountry: ['IE']
			},
			{
				id: 204368,
				title: 'Bodkin',
				overview: 'A motley crew of podcasters sets out to investigate the mysterious disappearance of three strangers in an idyllic Irish coastal town.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5k7m3X8r6a1j9b2K4e0L9P0q1.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2024-05-09',
				releaseYear: '2024',
				voteAverage: 7.3,
				voteCount: 160,
				originCountry: ['IE']
			}
		],
		ROW: [
			{
				id: 197067,
				title: 'Blood Sisters',
				overview: 'Bound by a dangerous secret, best friends Sarah and Kemi are forced to go on the run after a wealthy groom disappears.',
				posterPath: 'https://image.tmdb.org/t/p/w500/8k7m3X8r6a1j9b2K4e0L9P2q3.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2022-05-05',
				releaseYear: '2022',
				voteAverage: 7.5,
				voteCount: 65,
				originCountry: ['NG']
			},
			{
				id: 235484,
				title: 'The Railway Men',
				overview: 'After a deadly gas leaks from a factory in Bhopal, brave railway workers risk their lives to save others in the face of an unspeakable disaster.',
				posterPath: 'https://image.tmdb.org/t/p/w500/6k7m3X8r6a1j9b2K4e0L9P4q5.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2023-11-18',
				releaseYear: '2023',
				voteAverage: 8.2,
				voteCount: 140,
				originCountry: ['IN']
			}
		]
	};
	if (country === 'ALL') {
		return [
			baseMocks.GB[0],
			baseMocks.AU[0],
			baseMocks.CA[0],
			baseMocks.ZA[0],
			baseMocks.IE[0],
			baseMocks.NZ[0],
			baseMocks.ROW[1] || baseMocks.ROW[0]
		].filter((x): x is MediaItem => Boolean(x));
	}
	return baseMocks[country] || baseMocks.CA;
}

function getMockAcclaimedTV(country: CountryCode): MediaItem[] {
	const baseMocks: Record<Exclude<CountryCode, 'ALL'>, MediaItem[]> = {
		CA: [
			{
				id: 61662,
				title: 'Schitt\'s Creek',
				overview: 'When filthy-rich video store magnate Johnny Rose and his family suddenly find themselves broke, they are forced to leave their pampered lives to regroup in Schitt\'s Creek.',
				posterPath: 'https://image.tmdb.org/t/p/w500/iZvx3bI8pD5U9v1Xo5h6Y7Z8a9.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2015-01-13',
				releaseYear: '2015',
				voteAverage: 8.4,
				voteCount: 940,
				originCountry: ['CA']
			},
			{
				id: 79242,
				title: 'Letterkenny',
				overview: 'Letterkenny follows the inhabitants of a small Canadian town: the Hicks, the Skids, and the Hockey Players.',
				posterPath: 'https://image.tmdb.org/t/p/w500/9k8K7J6H5G4F3D2S1A0z9y8x.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2016-02-07',
				releaseYear: '2016',
				voteAverage: 8.3,
				voteCount: 280,
				originCountry: ['CA']
			}
		],
		GB: [
			{
				id: 60574,
				title: 'Peaky Blinders',
				overview: 'A gangster family epic set in 1919 Birmingham, England and centered on a gang who sew razor blades in the peaks of their caps.',
				posterPath: 'https://image.tmdb.org/t/p/w500/vUUqzWa2LnHIVqkaKVlVGkVcTTW.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/9faGSFi5jam6pDWGNdFaF8IRNGP.jpg',
				mediaType: 'tv',
				releaseDate: '2013-09-12',
				releaseYear: '2013',
				voteAverage: 8.5,
				voteCount: 9600,
				originCountry: ['GB']
			},
			{
				id: 67070,
				title: 'Fleabag',
				overview: 'A dry-witted female navigating through grief, family, and modern love in London.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7a3uO5hB2wY6qF8c4e0v1X.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2016-07-21',
				releaseYear: '2016',
				voteAverage: 8.6,
				voteCount: 2200,
				originCountry: ['GB']
			}
		],
		AU: [
			{
				id: 93533,
				title: 'Fisk',
				overview: 'Helen Tudor-Fisk is a contract lawyer who is forced to take a job at a shabby suburban law firm specializing in wills and estates.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4G6k8M2b1F0a9X8y7Z6w5V4u3.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2021-03-17',
				releaseYear: '2021',
				voteAverage: 8.2,
				voteCount: 110,
				originCountry: ['AU']
			},
			{
				id: 64554,
				title: 'Mr Inbetween',
				overview: 'Ray Shoesmith is a father, ex-husband, boyfriend and best friend: tough roles to juggle, and even tougher when you\'re a hitman for hire.',
				posterPath: 'https://image.tmdb.org/t/p/w500/6A7k4v8Y9b2Z5w3X1q0r8.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2018-09-25',
				releaseYear: '2018',
				voteAverage: 8.5,
				voteCount: 420,
				originCountry: ['AU']
			}
		],
		NZ: [
			{
				id: 2843,
				title: 'Flight of the Conchords',
				overview: 'Two New Zealand folk musicians try to make it in New York City with a naive manager and an obsessive sole fan.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5l1v6a7k8m9n0p1q2r3s4t.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2007-06-17',
				releaseYear: '2007',
				voteAverage: 8.1,
				voteCount: 380,
				originCountry: ['NZ']
			}
		],
		ZA: [
			{
				id: 118227,
				title: 'Reyka',
				overview: 'Flawed but brilliant criminal profiler Reyka Gama investigates a string of brutal murders committed by a serial killer in KwaZulu-Natal.',
				posterPath: 'https://image.tmdb.org/t/p/w500/3a5b7c9d1e3f5g7h9j1k3m5.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2021-07-25',
				releaseYear: '2021',
				voteAverage: 7.7,
				voteCount: 52,
				originCountry: ['ZA']
			},
			{
				id: 94726,
				title: 'Trackers',
				overview: 'An action-packed thriller intertwining black rhinos, the CIA, international terrorism, organized crime, and smuggled diamonds in Cape Town.',
				posterPath: 'https://image.tmdb.org/t/p/w500/2a4b6c8d0e2f4g6h8j0k2m4.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2019-10-27',
				releaseYear: '2019',
				voteAverage: 7.5,
				voteCount: 78,
				originCountry: ['ZA']
			}
		],
		IE: [
			{
				id: 97546,
				title: 'Normal People',
				overview: 'Marianne and Connell weave in and out of each other’s lives in an exquisite, complicated romance spanning high school and Trinity College Dublin.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5L1D4k2m9n0p1q2r3s4t5u6v.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2020-04-26',
				releaseYear: '2020',
				voteAverage: 8.3,
				voteCount: 1150,
				originCountry: ['IE']
			},
			{
				id: 76489,
				title: 'Derry Girls',
				overview: 'In 1990s Northern Ireland, a group of Catholic school friends navigate teenage drama amidst political unrest with uproarious wit.',
				posterPath: 'https://image.tmdb.org/t/p/w500/1k2m3n4p5q6r7s8t9u0v1w2.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2018-01-04',
				releaseYear: '2018',
				voteAverage: 8.2,
				voteCount: 580,
				originCountry: ['IE']
			}
		],
		ROW: [
			{
				id: 79352,
				title: 'Sacred Games',
				overview: 'A link in their pasts leads an honest Mumbai cop to a fugitive gang boss whose cryptic warning spurs an urgent bid to save the city.',
				posterPath: 'https://image.tmdb.org/t/p/w500/8k9m0n1p2q3r4s5t6u7v8w9.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2018-07-06',
				releaseYear: '2018',
				voteAverage: 7.8,
				voteCount: 320,
				originCountry: ['IN']
			},
			{
				id: 97893,
				title: 'Queen Sono',
				overview: 'A highly trained South African clandestine agent tackles criminal operations while dealing with personal crises across the continent.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4k5m6n7p8q9r0s1t2u3v4w5.jpg',
				backdropPath: null,
				mediaType: 'tv',
				releaseDate: '2020-02-28',
				releaseYear: '2020',
				voteAverage: 7.4,
				voteCount: 110,
				originCountry: ['ZA']
			}
		]
	};
	if (country === 'ALL') {
		return [
			baseMocks.GB[0],
			baseMocks.AU[1] || baseMocks.AU[0],
			baseMocks.CA[0],
			baseMocks.IE[0],
			baseMocks.NZ[0],
			baseMocks.ZA[0],
			baseMocks.ROW[0]
		].filter((x): x is MediaItem => Boolean(x));
	}
	return baseMocks[country] || baseMocks.CA;
}

function getMockPopularMovies(country: CountryCode): MediaItem[] {
	const baseMocks: Record<Exclude<CountryCode, 'ALL'>, MediaItem[]> = {
		CA: [
			{
				id: 1064213,
				title: 'BlackBerry',
				overview: 'The story of the meteoric rise and catastrophic demise of the world\'s first smartphone.',
				posterPath: 'https://image.tmdb.org/t/p/w500/neWy0iqFrZgq2sH1W9s6lZkL8.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/9Adfj2xK3l4M5N6O7P8Q9R0.jpg',
				mediaType: 'movie',
				releaseDate: '2023-05-11',
				releaseYear: '2023',
				voteAverage: 7.3,
				voteCount: 780,
				originCountry: ['CA']
			},
			{
				id: 934433,
				title: 'Infinity Pool',
				overview: 'James and Em Foster are enjoying an all-inclusive beach vacation in the fictional island of La Tolqa, when a fatal accident exposes the resort\'s perverse subculture.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5k7m3X8r6a1j9b2K4e0L9P.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2023-01-27',
				releaseYear: '2023',
				voteAverage: 6.5,
				voteCount: 920,
				originCountry: ['CA']
			}
		],
		GB: [
			{
				id: 1159311,
				title: 'The Zone of Interest',
				overview: 'The commandant of Auschwitz, Rudolf Höss, and his wife Hedwig, strive to build a dream life for their family in a house and garden next to the camp.',
				posterPath: 'https://image.tmdb.org/t/p/w500/hUu9zyZm138I7aV2q2r8.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/8uO0gUM8aNq.jpg',
				mediaType: 'movie',
				releaseDate: '2023-12-15',
				releaseYear: '2023',
				voteAverage: 7.7,
				voteCount: 1950,
				originCountry: ['GB']
			},
			{
				id: 1075175,
				title: 'All of Us Strangers',
				overview: 'One night in his near-empty tower block in contemporary London, Adam has a chance encounter with a mysterious neighbor Harry.',
				posterPath: 'https://image.tmdb.org/t/p/w500/aW9j6i3H2m1k0p8q5V4r.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2023-12-22',
				releaseYear: '2023',
				voteAverage: 7.8,
				voteCount: 880,
				originCountry: ['GB']
			}
		],
		AU: [
			{
				id: 1008042,
				title: 'Talk to Me',
				overview: 'When a group of friends discover how to conjure spirits using an embalmed hand, they become hooked on the new thrill.',
				posterPath: 'https://image.tmdb.org/t/p/w500/kdPMUMJzyYAc4roD52qavX0nJy9.jpg',
				backdropPath: 'https://image.tmdb.org/t/p/w1280/4fD7i7n9.jpg',
				mediaType: 'movie',
				releaseDate: '2023-07-26',
				releaseYear: '2023',
				voteAverage: 7.1,
				voteCount: 2600,
				originCountry: ['AU']
			},
			{
				id: 76341,
				title: 'Mad Max: Fury Road',
				overview: 'An apocalyptic story set in the furthest reaches of our planet, in a stark desert landscape where humanity is broken.',
				posterPath: 'https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2015-05-13',
				releaseYear: '2015',
				voteAverage: 7.6,
				voteCount: 22000,
				originCountry: ['AU']
			}
		],
		NZ: [
			{
				id: 246741,
				title: 'What We Do in the Shadows',
				overview: 'Vampire housemates try to cope with the complexities of modern life and show a newly turned hipster the perks of being undead.',
				posterPath: 'https://image.tmdb.org/t/p/w500/1e7qOqHq5k4j3h8f2m.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2014-06-19',
				releaseYear: '2014',
				voteAverage: 7.7,
				voteCount: 3600,
				originCountry: ['NZ']
			},
			{
				id: 346648,
				title: 'Hunt for the Wilderpeople',
				overview: 'A national manhunt is ordered for a rebellious kid and his foster uncle who go missing in the wild New Zealand bush.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4zYg4v9m.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2016-03-31',
				releaseYear: '2016',
				voteAverage: 7.7,
				voteCount: 2100,
				originCountry: ['NZ']
			}
		],
		ZA: [
			{
				id: 17654,
				title: 'District 9',
				overview: 'Thirty years ago, aliens arrive on Earth not to conquer or give aid, but to find refuge in a militarized slum in Johannesburg.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7bhvs01N4e41WqP7V0z8k6l9.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2009-08-13',
				releaseYear: '2009',
				voteAverage: 7.4,
				voteCount: 9100,
				originCountry: ['ZA']
			},
			{
				id: 947477,
				title: 'Silverton Siege',
				overview: 'After a failed sabotage mission, a trio of anti-apartheid freedom fighters ends up in a tense bank hostage situation in Pretoria.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5k7m3X8r6a1j9b2K4e0L9P3q4.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2022-04-27',
				releaseYear: '2022',
				voteAverage: 6.6,
				voteCount: 240,
				originCountry: ['ZA']
			}
		],
		IE: [
			{
				id: 674324,
				title: 'The Banshees of Inisherin',
				overview: 'Two lifelong friends find themselves at an impasse when one abruptly ends their relationship, with alarming consequences for both on a remote Irish island.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4bdeq1k2m3n4p5q6r7s8t9.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2022-10-21',
				releaseYear: '2022',
				voteAverage: 7.5,
				voteCount: 3100,
				originCountry: ['IE']
			},
			{
				id: 369557,
				title: 'Sing Street',
				overview: 'A boy growing up in Dublin during the 1980s escapes his strained family life by starting a band to impress the mysterious girl he likes.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7a2b3c4d5e6f7g8h9j0k1.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2016-03-17',
				releaseYear: '2016',
				voteAverage: 7.9,
				voteCount: 2150,
				originCountry: ['IE']
			}
		],
		ROW: [
			{
				id: 579974,
				title: 'RRR',
				overview: 'A fearless warrior on a perilous mission comes face to face with a steely cop serving the British forces in pre-independent India.',
				posterPath: 'https://image.tmdb.org/t/p/w500/nEufeZlyAOLqO2brrs0yeMuFiXQ.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2022-03-24',
				releaseYear: '2022',
				voteAverage: 7.8,
				voteCount: 1600,
				originCountry: ['IN']
			},
			{
				id: 1167271,
				title: 'The Black Book',
				overview: 'After his son is framed for a kidnapping, a bereaved deacon takes justice into his own hands and fights a corrupt police gang to absolve him in Nigeria.',
				posterPath: 'https://image.tmdb.org/t/p/w500/9k8m7n6p5q4r3s2t1u0v.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2023-09-22',
				releaseYear: '2023',
				voteAverage: 6.8,
				voteCount: 190,
				originCountry: ['NG']
			}
		]
	};
	if (country === 'ALL') {
		return [
			baseMocks.GB[0],
			baseMocks.AU[1] || baseMocks.AU[0],
			baseMocks.CA[0],
			baseMocks.IE[0],
			baseMocks.NZ[0],
			baseMocks.ZA[0],
			baseMocks.ROW[0]
		].filter((x): x is MediaItem => Boolean(x));
	}
	return baseMocks[country] || baseMocks.CA;
}

function getMockAcclaimedMovies(country: CountryCode): MediaItem[] {
	const baseMocks: Record<Exclude<CountryCode, 'ALL'>, MediaItem[]> = {
		CA: [
			{
				id: 64896,
				title: 'The Sweet Hereafter',
				overview: 'A small community is forever changed when a school bus accident occurs on a snowy road in a remote Canadian town.',
				posterPath: 'https://image.tmdb.org/t/p/w500/3a1b2c3d4e5f6g7h8j9k0l.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '1997-11-21',
				releaseYear: '1997',
				voteAverage: 7.3,
				voteCount: 940,
				originCountry: ['CA']
			},
			{
				id: 96424,
				title: 'Incendies',
				overview: 'Twins journey to the Middle East to discover their family history, unearthing secrets about their mother\'s past.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4b2c3d4e5f6g7h8j9k0l1m.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2010-09-17',
				releaseYear: '2010',
				voteAverage: 8.0,
				voteCount: 3800,
				originCountry: ['CA']
			}
		],
		GB: [
			{
				id: 45243,
				title: 'The King\'s Speech',
				overview: 'The story of King George VI, his unexpected ascension to the throne, and his friendship with a maverick speech therapist.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5c3d4e5f6g7h8j9k0l1m2n.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2010-12-24',
				releaseYear: '2010',
				voteAverage: 7.7,
				voteCount: 9200,
				originCountry: ['GB']
			},
			{
				id: 244,
				title: 'Trainspotting',
				overview: 'Renton, deeply immersed in the Edinburgh drug scene, tries to clean up and get out, despite the allure of the drugs and influence of friends.',
				posterPath: 'https://image.tmdb.org/t/p/w500/6d4e5f6g7h8j9k0l1m2n3p.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '1996-02-23',
				releaseYear: '1996',
				voteAverage: 8.1,
				voteCount: 12000,
				originCountry: ['GB']
			}
		],
		AU: [
			{
				id: 242224,
				title: 'The Babadook',
				overview: 'A widowed mother and her son face a sinister presence revealed in a mysterious children\'s book.',
				posterPath: 'https://image.tmdb.org/t/p/w500/7e5f6g7h8j9k0l1m2n3p4q.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2014-05-22',
				releaseYear: '2014',
				voteAverage: 6.6,
				voteCount: 6900,
				originCountry: ['AU']
			},
			{
				id: 398818,
				title: 'Lion',
				overview: 'Five-year-old Saroo gets lost on a train in India and is adopted by an Australian couple; years later he sets out to find his birthplace.',
				posterPath: 'https://image.tmdb.org/t/p/w500/8f6g7h8j9k0l1m2n3p4q5r.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2016-11-25',
				releaseYear: '2016',
				voteAverage: 8.0,
				voteCount: 5200,
				originCountry: ['AU']
			}
		],
		NZ: [
			{
				id: 66151,
				title: 'Boy',
				overview: 'A dreamy young Maori boy in 1984 believes his absentee father is a war hero, until he actually returns home.',
				posterPath: 'https://image.tmdb.org/t/p/w500/9g7h8j9k0l1m2n3p4q5r6s.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2010-02-24',
				releaseYear: '2010',
				voteAverage: 7.3,
				voteCount: 650,
				originCountry: ['NZ']
			},
			{
				id: 68721,
				title: 'The Piano',
				overview: 'A mute woman and her daughter travel to 1850s New Zealand for an arranged marriage to a wealthy landowner.',
				posterPath: 'https://image.tmdb.org/t/p/w500/0h8i9j0k1l2m3n4p5q6r7s8t.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '1993-05-20',
				releaseYear: '1993',
				voteAverage: 7.2,
				voteCount: 2100,
				originCountry: ['NZ']
			}
		],
		ZA: [
			{
				id: 2445,
				title: 'Tsotsi',
				overview: 'Six days in the violent life of a young Johannesburg gang leader who discovers an unexpected humanity.',
				posterPath: 'https://image.tmdb.org/t/p/w500/1i9j0k1l2m3n4p5q6r7s8t9u.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2005-12-23',
				releaseYear: '2005',
				voteAverage: 7.2,
				voteCount: 1300,
				originCountry: ['ZA']
			},
			{
				id: 10632,
				title: 'District 9',
				overview: 'Thirty years ago, aliens arrive on Earth not to conquer or give aid, but to find refuge in a militarized slum in Johannesburg.',
				posterPath: 'https://image.tmdb.org/t/p/w500/2j0k1l2m3n4p5q6r7s8t9u1v.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2009-08-13',
				releaseYear: '2009',
				voteAverage: 7.4,
				voteCount: 9100,
				originCountry: ['ZA']
			}
		],
		IE: [
			{
				id: 58223,
				title: 'The Commitments',
				overview: 'A wannabe band manager forms a soul group in a working-class Dublin suburb, chasing the sound of Motown.',
				posterPath: 'https://image.tmdb.org/t/p/w500/3k1l2m3n4p5q6r7s8t9u1v2w.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '1991-08-14',
				releaseYear: '1991',
				voteAverage: 7.3,
				voteCount: 1100,
				originCountry: ['IE']
			},
			{
				id: 284052,
				title: 'Brooklyn',
				overview: 'An Irish immigrant in 1950s New York finds herself torn between her new American life and the home she left behind.',
				posterPath: 'https://image.tmdb.org/t/p/w500/4l2m3n4p5q6r7s8t9u1v2w3x.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2015-11-06',
				releaseYear: '2015',
				voteAverage: 7.5,
				voteCount: 4100,
				originCountry: ['IE']
			}
		],
		ROW: [
			{
				id: 20453,
				title: '3 Idiots',
				overview: 'Two friends search for their long-lost college companion, a legendary student who taught them life\'s true priorities.',
				posterPath: 'https://image.tmdb.org/t/p/w500/5m3n4p5q6r7s8t9u1v2w3x4y.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2009-12-23',
				releaseYear: '2009',
				voteAverage: 8.4,
				voteCount: 11500,
				originCountry: ['IN']
			},
			{
				id: 2028,
				title: 'Lagaan',
				overview: 'The people of a small village in Victorian India stake their future on a game of cricket against their ruthless British rulers.',
				posterPath: 'https://image.tmdb.org/t/p/w500/6n4p5q6r7s8t9u1v2w3x4y5z.jpg',
				backdropPath: null,
				mediaType: 'movie',
				releaseDate: '2001-06-15',
				releaseYear: '2001',
				voteAverage: 7.7,
				voteCount: 2400,
				originCountry: ['IN']
			}
		]
	};
	if (country === 'ALL') {
		return [
			baseMocks.GB[0],
			baseMocks.AU[1] || baseMocks.AU[0],
			baseMocks.CA[0],
			baseMocks.IE[0],
			baseMocks.NZ[0],
			baseMocks.ZA[0],
			baseMocks.ROW[0]
		].filter((x): x is MediaItem => Boolean(x));
	}
	return baseMocks[country] || baseMocks.CA;
}
