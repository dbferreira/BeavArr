import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchMoreItems, type Category } from '$lib/server/tmdb';
import type { CountryCode } from '$lib/types';

const VALID_CATEGORIES: Category[] = ['trendingTV', 'acclaimedTV', 'popularMovies', 'acclaimedMovies'];
const VALID_COUNTRIES: CountryCode[] = ['ALL', 'CA', 'GB', 'AU', 'NZ', 'ZA', 'IE', 'ROW'];

export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category') as Category;
	const country = (url.searchParams.get('country') ?? 'ALL') as CountryCode;

	if (!VALID_CATEGORIES.includes(category) || !VALID_COUNTRIES.includes(country)) {
		return json({ items: [] }, { status: 400 });
	}

	const items = await fetchMoreItems(category, country);
	return json({ items });
};
