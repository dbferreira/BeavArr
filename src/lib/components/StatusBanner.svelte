<script lang="ts">
	import { Info, X, ExternalLink } from 'lucide-svelte';

	interface Props {
		tmdbConfigured: boolean;
		overseerrConfigured: boolean;
	}

	let { tmdbConfigured, overseerrConfigured }: Props = $props();

	let isDismissed = $state(false);

	let showBanner = $derived(!isDismissed && (!tmdbConfigured || !overseerrConfigured));
</script>

{#if showBanner}
	<aside
		aria-label="Configuration Notice"
		class="mx-4 my-2.5 p-3.5 rounded-2xl bg-[#14171c]/90 border border-white/10 backdrop-blur-md text-xs text-slate-300 relative shadow-lg"
	>
		<button
			type="button"
			onclick={() => (isDismissed = true)}
			class="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded-lg min-w-[32px] min-h-[32px] flex items-center justify-center"
			aria-label="Dismiss banner"
		>
			<X class="w-4 h-4" />
		</button>

		<div class="flex items-start gap-2.5 pr-6">
			<Info class="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" />
			<div class="space-y-1">
				<p class="font-bold text-white text-xs">
					{#if !tmdbConfigured && !overseerrConfigured}
						Demo Mode Active (Previewing Curated Titles)
					{:else if !tmdbConfigured}
						TMDb API Key Not Detected
					{:else}
						Overseerr / Jellyseerr Not Connected
					{/if}
				</p>
				<p class="text-slate-400 leading-relaxed text-[11px]">
					{#if !tmdbConfigured}
						Add <code class="px-1 py-0.5 rounded bg-black/40 text-slate-200 font-mono">TMDB_API_KEY</code> to your <code class="text-slate-200 font-mono">.env</code> to stream live discovery results.
					{/if}
					{#if !overseerrConfigured}
						Add <code class="px-1 py-0.5 rounded bg-black/40 text-slate-200 font-mono">OVERSEERR_URL</code> and <code class="px-1 py-0.5 rounded bg-black/40 text-slate-200 font-mono">OVERSEERR_API_KEY</code> for 1-click media requests.
					{/if}
				</p>
			</div>
		</div>
	</aside>
{/if}
