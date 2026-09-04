<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import MediaCard from './MediaCard.svelte';

	interface Props {
		title: string;
		icon: string;
		subtitle?: string;
		items: MediaItem[];
		onSelectMedia: (item: MediaItem) => void;
		onLoadMore?: () => void;
		loading?: boolean;
	}

	let { title, icon, subtitle, items, onSelectMedia, onLoadMore, loading = false }: Props = $props();

	let scrollContainer = $state<HTMLDivElement | null>(null);
	let prevCount = $state(items.length);

	// When more items are appended, scroll to reveal the first newly added card.
	$effect(() => {
		const count = items.length;
		if (count > prevCount && scrollContainer) {
			const card = scrollContainer.children[prevCount] as HTMLElement | undefined;
			if (card) {
				const containerRect = scrollContainer.getBoundingClientRect();
				const cardRect = card.getBoundingClientRect();
				scrollContainer.scrollTo({
					left: scrollContainer.scrollLeft + (cardRect.left - containerRect.left),
					behavior: 'smooth'
				});
			}
		}
		prevCount = count;
	});
</script>

<section class="py-3">
	<!-- Row Header -->
	<div class="flex items-baseline justify-between px-4 mb-2.5">
		<div class="flex items-center gap-2">
			<span class="text-lg select-none" role="img" aria-hidden="true">{icon}</span>
			<h2 class="text-base sm:text-lg font-bold text-white tracking-tight">
				{title}
			</h2>
			{#if subtitle}
				<span class="text-xs text-slate-400 font-medium hidden sm:inline">
					• {subtitle}
				</span>
			{/if}
		</div>

		{#if onLoadMore}
			<button
				type="button"
				class="text-[11px] font-semibold text-slate-400 font-mono px-2.5 py-1 rounded-md transition-colors hover:text-white hover:bg-white/10 active:bg-white/15 disabled:opacity-50 disabled:cursor-wait"
				onclick={onLoadMore}
				disabled={loading}
				aria-label={`Load more ${title}`}
			>
				{loading ? 'Loading…' : `${items.length} titles`}
			</button>
		{:else}
			<span class="text-[11px] font-semibold text-slate-400 font-mono">
				{items.length} titles
			</span>
		{/if}
	</div>

	<!-- Horizontal Scroll Snapping Carousel -->
	{#if items.length > 0}
		<div
			bind:this={scrollContainer}
			class="flex gap-3.5 px-4 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth pb-2 pt-1"
			aria-label={`${title} carousel`}
		>
			{#each items as item (item.id)}
				<MediaCard {item} onSelect={onSelectMedia} />
			{/each}
		</div>
	{:else}
		<div class="mx-4 p-6 rounded-2xl bg-[#14171c] border border-white/[0.06] text-center text-slate-400 text-sm">
			No titles found for this category.
		</div>
	{/if}
</section>
