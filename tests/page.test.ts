import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Page from '../src/routes/+page.svelte';
import { makeMediaItem } from './fixtures';

const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);

function makePageData() {
	return {
		country: 'CA' as const,
		countryInfo: { code: 'CA' as const, name: 'Canada', flag: '🇨🇦' },
		dateRange: 'any' as const,
		trendingTV: [makeMediaItem({ id: 1, title: 'Trending Show' })],
		acclaimedTV: [makeMediaItem({ id: 2, title: 'Acclaimed Show' })],
		popularMovies: [makeMediaItem({ id: 3, title: 'Popular Film', mediaType: 'movie' })],
		acclaimedMovies: [makeMediaItem({ id: 4, title: 'Acclaimed Film', mediaType: 'movie' })],
		tmdbConfigured: true,
		overseerrConfigured: true
	};
}

describe('discovery page', () => {
	it('renders all discovery sections and footer content', () => {
		render(Page, { props: { data: makePageData() } });

		expect(screen.getByRole('heading', { name: 'Trending TV Series' })).not.toBeNull();
		expect(screen.getByRole('heading', { name: 'Critically Acclaimed TV Series' })).not.toBeNull();
		expect(screen.getByRole('heading', { name: 'Popular Feature Films' })).not.toBeNull();
		expect(screen.getByRole('heading', { name: 'Critically Acclaimed Films' })).not.toBeNull();
		expect(screen.getByText('Designed for nzb360 WebView • Powered by TMDb & Overseerr')).not.toBeNull();
		expect(screen.getByText('IMDb ratings provided by IMDb. Used with permission.')).not.toBeNull();
		expect(screen.queryByRole('complementary', { name: 'Configuration Notice' })).toBeNull();
	});

	it('navigates when country or date filters are selected', async () => {
		render(Page, { props: { data: makePageData() } });

		await fireEvent.click(screen.getByRole('button', { name: 'UK UK' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Last month' }));

		expect(navigation.goto).toHaveBeenNthCalledWith(1, '?country=GB&range=any', {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
		expect(navigation.goto).toHaveBeenNthCalledWith(2, '?country=CA&range=month', {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	});

	it('loads and appends a unique batch for a carousel', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			items: [makeMediaItem({ id: 5, title: 'Loaded Show' })]
		}))));
		render(Page, { props: { data: makePageData() } });

		await fireEvent.click(screen.getByRole('button', { name: 'Load more Trending TV Series' }));
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Loaded Show' })).not.toBeNull());
		expect(fetch).toHaveBeenCalledWith('/api/more?category=trendingTV&country=CA&range=any');
		expect(screen.getByRole('button', { name: 'Load more Trending TV Series' })).toHaveTextContent('2 titles');
});
});
