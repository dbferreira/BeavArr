<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { CountryCode, DateRangeFilter, MediaItem } from '$lib/types';
	import TopBar from '$lib/components/TopBar.svelte';
	import Carousel from '$lib/components/Carousel.svelte';
	import DetailDrawer from '$lib/components/DetailDrawer.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';

	let { data }: { data: PageData } = $props();

	let selectedMedia = $state<MediaItem | null>(null);
	let isDrawerOpen = $state(false);

	type Category = 'trendingTV' | 'acclaimedTV' | 'popularMovies' | 'acclaimedMovies';

	let currentCountry = $state(data.country);
	let currentRange = $state(data.dateRange);
	let trendingTV = $state<MediaItem[]>([...data.trendingTV]);
	let acclaimedTV = $state<MediaItem[]>([...data.acclaimedTV]);
	let popularMovies = $state<MediaItem[]>([...data.popularMovies]);
	let acclaimedMovies = $state<MediaItem[]>([...data.acclaimedMovies]);
	let loadingMore = $state<Record<Category, boolean>>({
		trendingTV: false,
		acclaimedTV: false,
		popularMovies: false,
		acclaimedMovies: false
	});

	// Reset the mutable lists when switching country or date range.
	$effect(() => {
		if (data.country !== currentCountry || data.dateRange !== currentRange) {
			currentCountry = data.country;
			currentRange = data.dateRange;
			trendingTV = [...data.trendingTV];
			acclaimedTV = [...data.acclaimedTV];
			popularMovies = [...data.popularMovies];
			acclaimedMovies = [...data.acclaimedMovies];
		}
	});

	async function loadMore(category: Category) {
		if (loadingMore[category]) return;
		loadingMore[category] = true;
		try {
			const res = await fetch(
				`/api/more?category=${category}&country=${encodeURIComponent(data.country)}&range=${encodeURIComponent(data.dateRange)}`
			);
			const payload = await res.json();
			const newItems = (payload.items ?? []) as MediaItem[];

			if (category === 'trendingTV') {
				trendingTV = appendUnique(trendingTV, newItems);
			} else if (category === 'acclaimedTV') {
				acclaimedTV = appendUnique(acclaimedTV, newItems);
			} else if (category === 'popularMovies') {
				popularMovies = appendUnique(popularMovies, newItems);
			} else {
				acclaimedMovies = appendUnique(acclaimedMovies, newItems);
			}
		} catch (err) {
			console.error('Failed to load more titles', err);
		} finally {
			loadingMore[category] = false;
		}
	}

	function appendUnique(current: MediaItem[], incoming: MediaItem[]): MediaItem[] {
		const existing = new Set(current.map((item) => item.id));
		const fresh = incoming.filter((item) => !existing.has(item.id));
		if (fresh.length === 0) return current;
		return [...current, ...fresh];
	}

	function handleSelectCountry(country: CountryCode) {
		goto(`?country=${country}&range=${data.dateRange}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function handleSelectRange(range: DateRangeFilter) {
		goto(`?country=${data.country}&range=${range}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function handleSelectMedia(item: MediaItem) {
		selectedMedia = item;
		isDrawerOpen = true;
	}

	function handleCloseDrawer() {
		isDrawerOpen = false;
	}
</script>

<svelte:head>
	<title>BeavArr 🦫 {data.countryInfo.flag} {data.countryInfo.name} Media Discovery</title>
</svelte:head>

<div class="min-h-screen bg-[#0a0b0d] text-slate-100 flex flex-col selection:bg-[#e03131] selection:text-white pb-16">
	<!-- Top Navigation Bar with Logo & Country Filter -->
	<TopBar
		currentCountry={data.country}
		currentRange={data.dateRange}
		onSelectCountry={handleSelectCountry}
		onSelectRange={handleSelectRange}
	/>

	<!-- Config Guidance Banner (if TMDb or Overseerr need keys) -->
	<StatusBanner
		tmdbConfigured={data.tmdbConfigured}
		overseerrConfigured={data.overseerrConfigured}
	/>

	<!-- Main Discovery Carousels Container -->
	<main class="flex-1 space-y-2 pt-1 max-w-5xl mx-auto w-full">
		<!-- 1. Trending TV Carousel -->
		<Carousel
			title="Trending TV Series"
			icon="📺"
			subtitle={`Popular series right now in ${data.countryInfo.name}`}
			items={trendingTV}
			onSelectMedia={handleSelectMedia}
			onLoadMore={() => loadMore('trendingTV')}
			loading={loadingMore.trendingTV}
		/>

		<!-- 2. Critically Acclaimed TV Carousel -->
		<Carousel
			title="Critically Acclaimed TV Series"
			icon="🏆"
			subtitle={`Highest-rated television gems`}
			items={acclaimedTV}
			onSelectMedia={handleSelectMedia}
			onLoadMore={() => loadMore('acclaimedTV')}
			loading={loadingMore.acclaimedTV}
		/>

		<!-- 3. Popular Movies Carousel -->
		<Carousel
			title="Popular Feature Films"
			icon="🎬"
			subtitle={`Top recent theatrical releases`}
			items={popularMovies}
			onSelectMedia={handleSelectMedia}
			onLoadMore={() => loadMore('popularMovies')}
			loading={loadingMore.popularMovies}
		/>

		<!-- 4. Critically Acclaimed Movies Carousel -->
		<Carousel
			title="Critically Acclaimed Films"
			icon="🏆"
			subtitle={`Highest-rated cinematic gems`}
			items={acclaimedMovies}
			onSelectMedia={handleSelectMedia}
			onLoadMore={() => loadMore('acclaimedMovies')}
			loading={loadingMore.acclaimedMovies}
		/>
	</main>

	<!-- Footer with branding & app context -->
	<footer class="mt-8 pt-6 pb-4 border-t border-white/[0.06] text-center text-xs text-slate-400 px-4">
		<p class="font-medium text-slate-400">
			🦫 <span class="text-white font-semibold">BeavArr</span> • Dam good media from outside the States.
		</p>
		<p class="mt-1 text-[11px] text-slate-400">
			Designed for nzb360 WebView • Powered by TMDb & Overseerr
		</p>
		<p class="mt-1 text-[11px] text-slate-400">
			This product uses the TMDb API but is not endorsed or certified by TMDb.
		</p>
	</footer>

	<!-- Detail Drawer Modal (Bottom Sheet) -->
	<DetailDrawer
		item={selectedMedia}
		isOpen={isDrawerOpen}
		onClose={handleCloseDrawer}
	/>
</div>
