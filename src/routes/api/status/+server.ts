import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaStatus, isOverseerrConfigured } from '$lib/server/overseerr';
import { OverseerrMediaStatus } from '$lib/types';

export const GET: RequestHandler = async ({ url }) => {
	const mediaTypeParam = url.searchParams.get('mediaType');
	const tmdbIdParam = url.searchParams.get('tmdbId');

	if (!mediaTypeParam || (mediaTypeParam !== 'movie' && mediaTypeParam !== 'tv') || !tmdbIdParam) {
		return json({ error: 'Missing or invalid mediaType and tmdbId' }, { status: 400 });
	}

	const tmdbId = parseInt(tmdbIdParam, 10);
	if (isNaN(tmdbId)) {
		return json({ error: 'Invalid tmdbId' }, { status: 400 });
	}

	if (!isOverseerrConfigured()) {
		return json({
			status: OverseerrMediaStatus.UNKNOWN,
			configured: false
		});
	}

	const result = await getMediaStatus(mediaTypeParam as 'movie' | 'tv', tmdbId);
	return json({
		status: result.status,
		configured: true
	});
};
