import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requestMedia } from '$lib/server/overseerr';
import type { RequestPayload } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body || typeof body.mediaId !== 'number' || (body.mediaType !== 'movie' && body.mediaType !== 'tv')) {
			return json(
				{
					success: false,
					error: 'Invalid request payload. Must provide numeric mediaId and mediaType ("movie" or "tv").'
				},
				{ status: 400 }
			);
		}

		const payload: RequestPayload = {
			mediaId: body.mediaId,
			mediaType: body.mediaType,
			seasons: body.seasons || 'all'
		};

		const result = await requestMedia(payload);

		if (!result.success) {
			return json(result, { status: 400 });
		}

		return json(result, { status: 200 });
	} catch (err) {
		console.error('[API /api/request] Unhandled error:', err);
		return json(
			{
				success: false,
				error: 'Internal server error while processing request.'
			},
			{ status: 500 }
		);
	}
};
