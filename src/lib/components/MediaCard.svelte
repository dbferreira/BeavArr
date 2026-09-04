<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { Star } from 'lucide-svelte';

	interface Props {
		item: MediaItem;
		onSelect: (item: MediaItem) => void;
	}

	let { item, onSelect }: Props = $props();

	let imageLoaded = $state(false);
	let imageFailed = $state(false);
</script>

<button
	type="button"
	onclick={() => onSelect(item)}
	class="snap-start shrink-0 w-[140px] sm:w-[160px] flex flex-col group cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e03131] rounded-2xl transition-transform duration-150 active:scale-95 border-0 bg-transparent p-0"
	aria-label={`View details for ${item.title}`}
>
	<!-- Poster Container (2:3 Aspect Ratio) -->
	<div class="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#14171c] border border-white/[0.08] shadow-md group-hover:border-white/[0.2] transition-colors">
		{#if item.posterPath && !imageFailed}
			<img
				src={item.posterPath}
				alt={item.title}
				loading="lazy"
				onload={() => (imageLoaded = true)}
				onerror={() => (imageFailed = true)}
				class="w-full h-full object-cover transition-opacity duration-300 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
			/>
		{/if}

		<!-- Skeleton / Placeholder when image is loading or unavailable -->
		{#if !imageLoaded || imageFailed || !item.posterPath}
			<div class="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-[#14171c] to-[#1c2128]">
				<span class="text-3xl mb-1 opacity-70 select-none">🦫</span>
				<span class="text-xs text-slate-400 font-semibold line-clamp-3">{item.title}</span>
			</div>
		{/if}

		<!-- Gradient Vignette -->
		<div class="absolute inset-0 bg-gradient-to-t from-[#0a0b0d]/90 via-transparent to-black/20 pointer-events-none"></div>

		<!-- Top Left Tag: Country Code -->
		{#if item.originCountry && item.originCountry.length > 0}
			<div class="absolute top-2 left-2">
				<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-black/60 backdrop-blur-md text-slate-200 border border-white/10">
					{item.originCountry[0]}
				</span>
			</div>
		{/if}

		<!-- Top Right Tag: Media Type -->
		<div class="absolute top-2 right-2">
			<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-black/60 backdrop-blur-md text-slate-200 border border-white/10">
				{item.mediaType === 'tv' ? 'TV' : 'Movie'}
			</span>
		</div>

		<!-- Bottom Left Tag: Star Rating -->
		{#if item.voteAverage > 0}
			<div class="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-xs font-bold text-[#f59e0b]">
				<Star class="w-3 h-3 fill-[#f59e0b] stroke-[#f59e0b]" />
				<span>{item.voteAverage.toFixed(1)}</span>
			</div>
		{/if}

		{#if item.imdbRating !== undefined}
			<div class="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-bold text-[#f5c518]" title={`IMDb rating: ${item.imdbRating.toFixed(1)}`}>
				<span class="font-black">IMDb</span>
				<span>{item.imdbRating.toFixed(1)}</span>
			</div>
		{/if}
	</div>

	<!-- Title & Year Meta -->
	<div class="mt-2 px-0.5 w-full">
		<h3 class="text-xs sm:text-sm font-semibold text-slate-200 line-clamp-1 group-hover:text-white transition-colors">
			{item.title}
		</h3>
		<p class="text-[11px] text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
			{item.releaseYear}
			{#if item.certification}
				<span class="px-1 py-0.5 rounded bg-white/10 text-slate-200 text-[9px] font-bold tracking-wide uppercase">
					{item.certification}
				</span>
			{/if}
		</p>
	</div>
</button>
