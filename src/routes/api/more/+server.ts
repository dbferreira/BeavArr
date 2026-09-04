import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchMoreItems, type Category } from '$lib/server/tmdb';
import type { CountryCode, DateRangeFilter } from '$lib/types';

const VALID_CATEGORIES: Category[] = ['trendingTV', 'acclaimedTV', 'popularMovies', 'acclaimedMovies'];
const VALID_COUNTRIES: CountryCode[] = ['ALL', 'CA', 'GB', 'AU', 'NZ', 'ZA', 'IE', 'ROW'];
const VALID_DATE_RANGES: DateRangeFilter[] = ['any', 'week', 'month', 'three_months', 'six_months', 'year'];

export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category') as Category;
	const country = (url.searchParams.get('country') ?? 'ALL') as CountryCode;
	const dateRange = (url.searchParams.get('range') ?? 'any') as DateRangeFilter;

	if (
		!VALID_CATEGORIES.includes(category) ||
		!VALID_COUNTRIES.includes(country) ||
		!VALID_DATE_RANGES.includes(dateRange)
	) {
		return json({ items: [] }, { status: 400 });
	}

	const items = await fetchMoreItems(category, country, dateRange);
	return json({ items });
};
