import type { PageServerLoad } from './$types';
import type { CountryCode, DiscoverResponse } from '$lib/types';
import {
	getTrendingTV,
	getCriticallyAcclaimedTV,
	getPopularMovies,
	getCriticallyAcclaimedMovies,
	isTmdbConfigured
} from '$lib/server/tmdb';
import { isOverseerrConfigured } from '$lib/server/overseerr';

const VALID_COUNTRIES: Record<CountryCode, { name: string; flag: string }> = {
	ALL: { name: 'All Non-US', flag: '🌐' },
	CA: { name: 'Canada', flag: '🇨🇦' },
	GB: { name: 'United Kingdom', flag: '🇬🇧' },
	AU: { name: 'Australia', flag: '🇦🇺' },
	NZ: { name: 'New Zealand', flag: '🇳🇿' },
	ZA: { name: 'South Africa', flag: '🇿🇦' },
	IE: { name: 'Ireland', flag: '🇮🇪' },
	ROW: { name: 'Rest of World', flag: '🌍' }
};

export const load: PageServerLoad = async ({ url }): Promise<DiscoverResponse> => {
	const requestedCountry = url.searchParams.get('country')?.toUpperCase() as CountryCode;
	const country: CountryCode = (requestedCountry in VALID_COUNTRIES) ? requestedCountry : 'ALL';

	const countryInfo = {
		code: country,
		name: VALID_COUNTRIES[country].name,
		flag: VALID_COUNTRIES[country].flag
	};

	// Parallel fetch of discover rows
	const [trendingTV, acclaimedTV, popularMovies, acclaimedMovies] = await Promise.all([
		getTrendingTV(country),
		getCriticallyAcclaimedTV(country),
		getPopularMovies(country),
		getCriticallyAcclaimedMovies(country)
	]);

	return {
		country,
		countryInfo,
		trendingTV,
		acclaimedTV,
		popularMovies,
		acclaimedMovies,
		tmdbConfigured: isTmdbConfigured(),
		overseerrConfigured: isOverseerrConfigured()
	};
};
