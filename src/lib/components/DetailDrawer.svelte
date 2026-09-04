<script lang="ts">
	import type { ExternalLinks, MediaItem } from '$lib/types';
	import { OverseerrMediaStatus } from '$lib/types';
	import { Star, X, Check, Clock, AlertCircle, Loader2, Send, ExternalLink } from 'lucide-svelte';

	interface Props {
		item: MediaItem | null;
		isOpen: boolean;
		onClose: () => void;
	}

	let { item, isOpen, onClose }: Props = $props();

	let currentStatus = $state<OverseerrMediaStatus>(OverseerrMediaStatus.UNKNOWN);
	let isCheckingStatus = $state(false);
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let submitSuccess = $state<string | null>(null);
	let isConfigured = $state(true);
	let backdropFailed = $state(false);
	let posterFailed = $state(false);
	let externalLinks = $state<ExternalLinks | null>(null);
	let isLoadingLinks = $state(false);

	// Fetch Overseerr status whenever a new item is opened
	$effect(() => {
		if (isOpen && item) {
			backdropFailed = false;
			posterFailed = false;
			checkOverseerrStatus(item);
			loadExternalLinks(item);
			submitError = null;
			submitSuccess = null;
		}
	});

	async function loadExternalLinks(media: MediaItem) {
		isLoadingLinks = true;
		try {
			const res = await fetch(`/api/links?mediaType=${media.mediaType}&tmdbId=${media.id}`);
			if (res.ok) {
				externalLinks = await res.json();
			} else {
				externalLinks = {
					tmdbUrl: `https://www.themoviedb.org/${media.mediaType}/${media.id}`,
					imdbUrl: null
				};
			}
		} catch (err) {
			console.warn('External links fetch failed:', err);
			externalLinks = {
				tmdbUrl: `https://www.themoviedb.org/${media.mediaType}/${media.id}`,
				imdbUrl: null
			};
		} finally {
			isLoadingLinks = false;
		}
	}

	async function checkOverseerrStatus(media: MediaItem) {
		isCheckingStatus = true;
		currentStatus = media.overseerrStatus || OverseerrMediaStatus.UNKNOWN;

		try {
			const res = await fetch(`/api/status?mediaType=${media.mediaType}&tmdbId=${media.id}`);
			if (res.ok) {
				const data = await res.json();
				currentStatus = data.status;
				isConfigured = data.configured ?? true;
			}
		} catch (err) {
			console.warn('Status check failed:', err);
		} finally {
			isCheckingStatus = false;
		}
	}

	async function handleRequest() {
		if (!item || isSubmitting) return;

		isSubmitting = true;
		submitError = null;
		submitSuccess = null;

		try {
			const res = await fetch('/api/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					mediaId: item.id,
					mediaType: item.mediaType,
					seasons: 'all'
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				submitError = data.error || 'Failed to submit request to Overseerr.';
			} else {
				currentStatus = OverseerrMediaStatus.PENDING;
				submitSuccess = data.message || 'Request successfully sent to Overseerr!';
			}
		} catch (err) {
			console.error('Submit error:', err);
			submitError = 'Network error communicating with BeavArr backend.';
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && item}
	<!-- Modal Backdrop Scrim -->
	<div
		role="presentation"
		onclick={onClose}
		class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
	></div>

	<!-- Bottom Sheet Drawer -->
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="drawer-title"
		class="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] sm:max-h-[85vh] sm:max-w-xl sm:mx-auto bg-[#14171c] rounded-t-3xl border-t border-white/[0.12] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 animate-in slide-in-from-bottom text-slate-100"
	>
		<!-- Drag Handle Bar for native app feel -->
		<div class="pt-3 pb-1 flex justify-center shrink-0 cursor-grab active:cursor-grabbing">
			<div class="w-12 h-1.5 rounded-full bg-white/20"></div>
		</div>

		<!-- Close Button (min 48px touch target) -->
		<button
			type="button"
			onclick={onClose}
			aria-label="Close details"
			class="absolute top-3 right-3 z-20 min-w-[48px] min-h-[48px] p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md flex items-center justify-center transition-colors border border-white/10 active:scale-95"
		>
			<X class="w-5 h-5" />
		</button>

		<!-- Scrollable Content Area -->
		<div class="overflow-y-auto no-scrollbar flex-1 pb-6">
			<!-- Banner Backdrop Image -->
			<div class="relative w-full h-44 sm:h-56 bg-[#0a0b0d] overflow-hidden shrink-0">
				{#if item.backdropPath && !backdropFailed}
					<img
						src={item.backdropPath}
						alt={item.title}
						onerror={() => (backdropFailed = true)}
						class="w-full h-full object-cover"
					/>
				{:else if item.posterPath && !posterFailed}
					<img
						src={item.posterPath}
						alt={item.title}
						onerror={() => (posterFailed = true)}
						class="w-full h-full object-cover blur-sm opacity-50 scale-105"
					/>
				{/if}

				{#if (!item.backdropPath || backdropFailed) && (!item.posterPath || posterFailed)}
					<div class="w-full h-full bg-gradient-to-br from-[#1c2128] via-[#14171c] to-[#0a0b0d] flex items-center justify-center">
						<span class="text-6xl opacity-20 select-none">🦫</span>
					</div>
				{/if}

				<!-- Vignette Gradient -->
				<div class="absolute inset-0 bg-gradient-to-t from-[#14171c] via-[#14171c]/40 to-transparent"></div>

				<!-- Country Flag Tag -->
				{#if item.originCountry && item.originCountry.length > 0}
					<div class="absolute bottom-3 left-4 flex gap-1.5">
						{#each item.originCountry as countryCode}
							<span class="px-2 py-0.5 rounded-md text-xs font-bold bg-black/60 backdrop-blur-md border border-white/15 text-white">
								{countryCode}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Media Details Section -->
			<div class="px-5 pt-2">
				<!-- Title & Year Header -->
				<div class="flex items-start justify-between gap-3 mb-2">
					<div>
						<h2 id="drawer-title" class="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
							{item.title}
						</h2>
						<div class="flex items-center gap-2 mt-1 text-xs sm:text-sm text-slate-400 font-medium">
							<span>{item.releaseYear}</span>
							{#if item.certification}
								<span>•</span>
								<span class="uppercase font-semibold tracking-wider text-slate-200">{item.certification}</span>
							{/if}
							<span>•</span>
							<span class="uppercase font-semibold tracking-wider">{item.mediaType === 'tv' ? 'TV Series' : 'Movie'}</span>
							{#if item.voteAverage > 0}
								<span>•</span>
								<div class="flex items-center gap-1 text-[#f59e0b] font-bold">
									<Star class="w-3.5 h-3.5 fill-[#f59e0b] stroke-[#f59e0b]" />
									<span>{item.voteAverage.toFixed(1)}</span>
									<span class="text-slate-400 text-[11px] font-normal">({item.voteCount.toLocaleString()})</span>
								</div>
							{/if}
							{#if item.imdbRating !== undefined}
								<span>•</span>
								<span class="font-semibold tracking-wider text-[#f5c518]">
									IMDb {item.imdbRating.toFixed(1)}{#if item.imdbVoteCount !== undefined} ({item.imdbVoteCount.toLocaleString()}){/if}
								</span>
							{/if}
						</div>
					</div>
				</div>

				{#if item.genres && item.genres.length > 0}
					<div class="mt-3" aria-label="Genres">
						<h3 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2">Genres</h3>
						<div class="flex flex-wrap gap-1.5">
							{#each item.genres as genre}
								<span class="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs font-medium text-slate-300">
									{genre}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Status Badge Indicator -->
				<div class="my-3 flex items-center gap-2">
					{#if isCheckingStatus}
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.06] text-xs text-slate-300">
							<Loader2 class="w-3.5 h-3.5 animate-spin" />
							<span>Checking library status...</span>
						</div>
					{:else if currentStatus === OverseerrMediaStatus.AVAILABLE}
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#10b981]/20 border border-[#10b981]/40 text-xs font-semibold text-[#10b981]">
							<Check class="w-3.5 h-3.5" />
							<span>Available in Plex / Jellyfin</span>
						</div>
					{:else if currentStatus === OverseerrMediaStatus.PENDING || currentStatus === OverseerrMediaStatus.PROCESSING}
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f59e0b]/20 border border-[#f59e0b]/40 text-xs font-semibold text-[#f59e0b]">
							<Clock class="w-3.5 h-3.5" />
							<span>Requested in Overseerr ({currentStatus === OverseerrMediaStatus.PENDING ? 'Pending' : 'Processing'})</span>
						</div>
					{:else if !isConfigured}
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-slate-400">
							<span>Overseerr offline / unconfigured</span>
						</div>
					{/if}
				</div>

				<!-- Overview / Synopsis -->
				<div class="mt-4">
					<h3 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1.5">
						Synopsis
					</h3>
					<p class="text-sm leading-relaxed text-slate-300">
						{item.overview}
					</p>
				</div>

				<!-- External Reference Links -->
				{#if externalLinks || isLoadingLinks}
					<div class="mt-4">
						<h3 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2">
							Read more
						</h3>
						<div class="flex flex-wrap gap-2">
							{#if externalLinks}
								<a
									href={externalLinks.tmdbUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-slate-200 hover:bg-white/[0.1] transition-colors"
								>
									<ExternalLink class="w-3.5 h-3.5" />
									<span>TMDb</span>
								</a>
								{#if externalLinks.imdbUrl}
									<a
										href={externalLinks.imdbUrl}
										target="_blank"
										rel="noreferrer"
										class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-slate-200 hover:bg-white/[0.1] transition-colors"
									>
										<ExternalLink class="w-3.5 h-3.5" />
										<span>IMDb</span>
									</a>
								{/if}
							{:else}
								<div class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400">
									<Loader2 class="w-3.5 h-3.5 animate-spin" />
									<span>Loading links...</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Error / Success Feedback Notifications -->
				{#if submitError}
					<div class="mt-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-start gap-2">
						<AlertCircle class="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
						<span>{submitError}</span>
					</div>
				{/if}

				{#if submitSuccess}
					<div class="mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2">
						<Check class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
						<span>{submitSuccess}</span>
					</div>
				{/if}

				<!-- Action Button (Min 48px touch target) -->
				<div class="mt-6 pt-2">
					{#if currentStatus === OverseerrMediaStatus.AVAILABLE}
						<!-- Status = 5: Disabled button: "✓ In Plex/Jellyfin" -->
						<button
							type="button"
							disabled
							class="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-[#10b981]/20 border border-[#10b981]/40 text-[#10b981] font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-not-allowed select-none"
						>
							<Check class="w-5 h-5" />
							<span>✓ In Plex/Jellyfin</span>
						</button>
					{:else if currentStatus === OverseerrMediaStatus.PENDING || currentStatus === OverseerrMediaStatus.PROCESSING}
						<!-- Status = 2 or 3: Disabled button: "⏳ Requested" -->
						<button
							type="button"
							disabled
							class="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-[#1c2128] border border-white/10 text-[#f59e0b] font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-not-allowed select-none"
						>
							<Clock class="w-5 h-5" />
							<span>⏳ Requested</span>
						</button>
					{:else}
						<!-- Otherwise: Prominent button: "Request via Overseerr" -->
						<button
							type="button"
							onclick={handleRequest}
							disabled={isSubmitting}
							class="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-[#e03131] hover:bg-[#c92a2a] active:scale-[0.98] transition-all duration-150 text-white font-bold text-sm sm:text-base shadow-lg shadow-[#e03131]/30 flex items-center justify-center gap-2 select-none disabled:opacity-70 disabled:pointer-events-none"
						>
							{#if isSubmitting}
								<Loader2 class="w-5 h-5 animate-spin" />
								<span>Submitting to Overseerr...</span>
							{:else}
								<Send class="w-5 h-5" />
								<span>Request via Overseerr</span>
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
