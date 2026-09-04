import type { MediaItem } from '$lib/types';

export function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
	return {
		id: 123,
		title: 'Test Title',
		overview: 'A test synopsis.',
		posterPath: null,
		backdropPath: null,
		mediaType: 'tv',
		releaseDate: '2024-01-01',
		releaseYear: '2024',
		voteAverage: 8.2,
		voteCount: 100,
		originCountry: ['CA'],
		...overrides
	};
}
