import { env } from '$env/dynamic/private';
import { OverseerrMediaStatus, type RequestPayload, type RequestResult } from '$lib/types';

function getBaseUrl(): string | null {
	const url = env.OVERSEERR_URL?.trim();
	if (!url) return null;
	return url.replace(/\/+$/, '');
}

function getApiKey(): string | null {
	return env.OVERSEERR_API_KEY?.trim() || null;
}

export function isOverseerrConfigured(): boolean {
	return Boolean(getBaseUrl() && getApiKey());
}

/**
 * Check media library status in Overseerr / Jellyseerr
 * GET /api/v1/{mediaType}/{tmdbId}
 * Statuses:
 * 1 = Unknown / None
 * 2 = Pending Approval
 * 3 = Processing
 * 4 = Partially Available
 * 5 = Available
 */
export async function getMediaStatus(
	mediaType: 'movie' | 'tv',
	tmdbId: number
): Promise<{ status: OverseerrMediaStatus; raw?: unknown }> {
	const baseUrl = getBaseUrl();
	const apiKey = getApiKey();

	if (!baseUrl || !apiKey) {
		return { status: OverseerrMediaStatus.UNKNOWN };
	}

	const endpoint = `${baseUrl}/api/v1/${mediaType}/${tmdbId}`;

	try {
		const res = await fetch(endpoint, {
			headers: {
				'X-Api-Key': apiKey,
				'Accept': 'application/json'
			},
			signal: AbortSignal.timeout(5000)
		});

		if (res.status === 404) {
			return { status: OverseerrMediaStatus.UNKNOWN };
		}

		if (!res.ok) {
			console.warn(`[Overseerr] Status check returned ${res.status} for ${mediaType}/${tmdbId}`);
			return { status: OverseerrMediaStatus.UNKNOWN };
		}

		const data = await res.json();
		// In Overseerr, mediaInfo contains the library/request state
		const mediaInfo = data.mediaInfo;
		if (!mediaInfo || typeof mediaInfo.status !== 'number') {
			return { status: OverseerrMediaStatus.UNKNOWN, raw: data };
		}

		return {
			status: mediaInfo.status as OverseerrMediaStatus,
			raw: mediaInfo
		};
	} catch (err) {
		console.warn(`[Overseerr] Could not connect to Overseerr for status check (${mediaType}/${tmdbId}):`, err);
		return { status: OverseerrMediaStatus.UNKNOWN };
	}
}

/**
 * Submit media request to Overseerr / Jellyseerr
 * POST /api/v1/request
 * Body: { mediaId: number, mediaType: 'movie' | 'tv', seasons: 'all' }
 */
export async function requestMedia(payload: RequestPayload): Promise<RequestResult> {
	const baseUrl = getBaseUrl();
	const apiKey = getApiKey();

	if (!baseUrl || !apiKey) {
		return {
			success: false,
			error: 'Overseerr is not configured. Please set OVERSEERR_URL and OVERSEERR_API_KEY in your environment.'
		};
	}

	const endpoint = `${baseUrl}/api/v1/request`;

	const requestBody: {
		mediaId: number;
		mediaType: 'movie' | 'tv';
		seasons?: 'all' | number[];
	} = {
		mediaId: payload.mediaId,
		mediaType: payload.mediaType
	};

	if (payload.mediaType === 'tv') {
		requestBody.seasons = payload.seasons || 'all';
	}

	try {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'X-Api-Key': apiKey,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify(requestBody),
			signal: AbortSignal.timeout(10000)
		});

		const responseData = await res.json().catch(() => null);

		if (res.status === 201 || res.status === 200) {
			return {
				success: true,
				status: OverseerrMediaStatus.PENDING,
				message: 'Request successfully submitted to Overseerr!'
			};
		}

		if (res.status === 409) {
			// Already requested or already available
			return {
				success: true,
				status: OverseerrMediaStatus.PENDING,
				message: 'Item has already been requested in Overseerr.'
			};
		}

		const errorMessage = responseData?.message || responseData?.error || `Overseerr responded with status ${res.status}`;
		return {
			success: false,
			error: errorMessage
		};
	} catch (err) {
		console.error('[Overseerr] Failed to submit request:', err);
		return {
			success: false,
			error: 'Could not connect to Overseerr. Please verify network connectivity and OVERSEERR_URL.'
		};
	}
}
