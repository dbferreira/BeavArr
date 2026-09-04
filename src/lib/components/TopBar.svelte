<script lang="ts">
	import type { CountryCode } from '$lib/types';

	interface Props {
		currentCountry: CountryCode;
		onSelectCountry: (country: CountryCode) => void;
	}

	let { currentCountry, onSelectCountry }: Props = $props();

	const countries: { code: CountryCode; name: string; flag: string }[] = [
		{ code: 'ALL', name: 'All Non-US', flag: '🌐' },
		{ code: 'CA', name: 'Canada', flag: '🇨🇦' },
		{ code: 'GB', name: 'UK', flag: '🇬🇧' },
		{ code: 'AU', name: 'Australia', flag: '🇦🇺' },
		{ code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
		{ code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
		{ code: 'IE', name: 'Ireland', flag: '🇮🇪' },
		{ code: 'ROW', name: 'Rest of World', flag: '🌍' }
	];
</script>

<header class="sticky top-0 z-40 bg-[#0a0b0d]/95 backdrop-blur-md border-b border-white/[0.06] px-4 pt-3.5 pb-3">
	<!-- Branding / Header Title -->
	<div class="flex items-center justify-between gap-3 mb-3">
		<div class="flex items-center gap-2.5">
			<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e03131] to-[#c92a2a] flex items-center justify-center shadow-lg shadow-[#e03131]/20 text-2xl select-none">
				🦫
			</div>
			<div>
				<div class="flex items-center gap-1.5">
					<h1 class="font-black text-xl tracking-tight text-white flex items-center">
						Beav<span class="text-[#e03131]">Arr</span>
					</h1>
					<span class="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300">
						Discovery
					</span>
				</div>
				<p class="text-xs text-slate-400 font-medium truncate">
					Dam good media from outside the States.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<div class="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" title="System Online"></div>
			<span class="text-[11px] text-slate-400 font-mono">nzb360</span>
		</div>
	</div>

	<!-- Country Navigation Pills -->
	<nav class="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1" aria-label="Country Filter">
		{#each countries as c}
			{@const isActive = currentCountry === c.code}
			<button
				type="button"
				onclick={() => onSelectCountry(c.code)}
				class="min-h-[48px] px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-2 shrink-0 border select-none active:scale-95 {
					isActive
						? 'bg-[#e03131] text-white border-[#e03131] shadow-md shadow-[#e03131]/30 font-bold'
						: 'bg-[#14171c] text-slate-300 border-white/[0.08] hover:bg-[#1c2128] hover:text-white'
				}"
				aria-pressed={isActive}
			>
				<span class="text-base" role="img" aria-label={c.name}>{c.flag}</span>
				<span>{c.name}</span>
			</button>
		{/each}
	</nav>
</header>
