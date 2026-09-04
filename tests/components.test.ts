import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Carousel from '$lib/components/Carousel.svelte';
import DetailDrawer from '$lib/components/DetailDrawer.svelte';
import MediaCard from '$lib/components/MediaCard.svelte';
import StatusBanner from '$lib/components/StatusBanner.svelte';
import TopBar from '$lib/components/TopBar.svelte';
import { OverseerrMediaStatus } from '$lib/types';
import { makeMediaItem } from './fixtures';

describe('TopBar', () => {
	it('renders filters and no longer renders the nzb360 status marker', async () => {
		const onSelectCountry = vi.fn();
		const onSelectRange = vi.fn();
		render(TopBar, {
			props: {
				currentCountry: 'CA',
				currentRange: 'month',
				onSelectCountry,
				onSelectRange
			}
		});

		expect(screen.getByRole('heading', { name: 'BeavArr' })).not.toBeNull();
		expect(screen.getByText('Discovery')).not.toBeNull();
		expect(screen.queryByText('nzb360')).toBeNull();
		expect(screen.getByRole('button', { name: 'Canada Canada' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(screen.getByRole('button', { name: 'UK UK' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Last year' }));
		expect(onSelectCountry).toHaveBeenCalledWith('GB');
		expect(onSelectRange).toHaveBeenCalledWith('year');
	});
});

describe('MediaCard', () => {
	it('renders metadata and selects the item when clicked', async () => {
		const item = makeMediaItem({ posterPath: 'https://example.com/poster.jpg', mediaType: 'movie' });
		const onSelect = vi.fn();
		render(MediaCard, { props: { item, onSelect } });

		expect(screen.getByRole('img', { name: item.title })).toHaveAttribute('src', item.posterPath);
		expect(screen.getByRole('heading', { name: item.title })).not.toBeNull();
		expect(screen.getByText('2024')).not.toBeNull();
		expect(screen.getByText('Movie')).not.toBeNull();
		expect(screen.getByText('8.2')).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: `View details for ${item.title}` }));
		expect(onSelect).toHaveBeenCalledWith(item);
	});

	it('shows a placeholder when no poster is available', () => {
		render(MediaCard, { props: { item: makeMediaItem({ posterPath: null }), onSelect: vi.fn() } });

		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByRole('heading', { name: 'Test Title' })).not.toBeNull();
	});
});

describe('Carousel', () => {
	it('renders cards, count, and the load-more action', async () => {
		const item = makeMediaItem();
		const onSelectMedia = vi.fn();
		const onLoadMore = vi.fn();
		render(Carousel, {
			props: {
				title: 'Trending TV Series',
				icon: '📺',
				subtitle: 'Popular now',
				items: [item],
				onSelectMedia,
				onLoadMore
			}
		});

		expect(screen.getByRole('heading', { name: 'Trending TV Series' })).not.toBeNull();
		expect(screen.getByText(/Popular now/)).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Load more Trending TV Series' })).toHaveTextContent('1 titles');
		await fireEvent.click(screen.getByRole('button', { name: 'View details for Test Title' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Load more Trending TV Series' }));
		expect(onSelectMedia).toHaveBeenCalledWith(item);
		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('renders an empty state and disables loading controls', () => {
		render(Carousel, {
		props: {
			title: 'Empty',
			icon: '🎬',
			items: [],
			onSelectMedia: vi.fn(),
			onLoadMore: vi.fn(),
			loading: true
		}
	});

		expect(screen.getByText('No titles found for this category.')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Load more Empty' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Load more Empty' })).toHaveTextContent('Loading…');
	});
});

describe('StatusBanner', () => {
	it.each([
		[false, false, 'Demo Mode Active (Previewing Curated Titles)'],
		[false, true, 'TMDb API Key Not Detected'],
		[true, false, 'Overseerr / Jellyseerr Not Connected']
	])('shows the correct message for configuration %s/%s', (tmdbConfigured, overseerrConfigured, message) => {
		render(StatusBanner, { props: { tmdbConfigured, overseerrConfigured } });

		expect(screen.getByText(message)).not.toBeNull();
	});

	it('can be dismissed', async () => {
		render(StatusBanner, { props: { tmdbConfigured: false, overseerrConfigured: false } });

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss banner' }));
		expect(screen.queryByRole('complementary', { name: 'Configuration Notice' })).toBeNull();
	});

	it('renders nothing when fully configured', () => {
		render(StatusBanner, { props: { tmdbConfigured: true, overseerrConfigured: true } });

		expect(screen.queryByRole('complementary')).toBeNull();
	});
});

describe('DetailDrawer', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/status')) {
				return new Response(JSON.stringify({ status: OverseerrMediaStatus.AVAILABLE, configured: true }));
			}
			if (url.startsWith('/api/links')) {
				return new Response(JSON.stringify({ tmdbUrl: 'https://tmdb.test/123', imdbUrl: null }));
			}
			if (url === '/api/request' && init?.method === 'POST') {
				return new Response(JSON.stringify({
					success: true,
					message: 'Queued successfully'
				}));
			}
			return new Response('{}', { status: 404 });
		}));
	});

	it('renders nothing while closed and loads status and links when opened', async () => {
		const item = makeMediaItem({ id: 77 });
		const onClose = vi.fn();
		const view = render(DetailDrawer, { props: { item, isOpen: false, onClose } });
		expect(screen.queryByRole('dialog')).toBeNull();

		await view.rerender({ item, isOpen: true, onClose });
		await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
		expect(screen.getByRole('heading', { name: item.title })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Close details' })).not.toBeNull();
		await waitFor(() => expect(screen.getByText('Available in Plex / Jellyfin')).not.toBeNull());
		expect(screen.getByRole('link', { name: 'TMDb' })).toHaveAttribute('href', 'https://tmdb.test/123');

		await fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('submits a request and displays success feedback', async () => {
		const item = makeMediaItem({ id: 88, overseerrStatus: OverseerrMediaStatus.UNKNOWN });
		vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).startsWith('/api/status')) {
				return new Response(JSON.stringify({ status: OverseerrMediaStatus.UNKNOWN, configured: true }));
			}
			if (String(input).startsWith('/api/links')) {
				return new Response(JSON.stringify({ tmdbUrl: 'https://tmdb.test/88', imdbUrl: null }));
			}
			return new Response(JSON.stringify({ success: true, message: 'Request queued' }), { status: 200 });
		});
		render(DetailDrawer, { props: { item, isOpen: true, onClose: vi.fn() } });

		const requestButton = await screen.findByRole('button', { name: 'Request via Overseerr' });
		await fireEvent.click(requestButton);
		await waitFor(() => expect(screen.getByText('Request queued')).not.toBeNull());
		expect(fetch).toHaveBeenCalledWith('/api/request', expect.objectContaining({
			method: 'POST',
			body: JSON.stringify({ mediaId: 88, mediaType: 'tv', seasons: 'all' })
		}));
	});
});
