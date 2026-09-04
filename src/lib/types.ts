export type CountryCode = 'ALL' | 'CA' | 'GB' | 'AU' | 'NZ' | 'ZA' | 'IE' | 'ROW';

export type DateRangeFilter = 'any' | 'week' | 'month' | 'six_months';

export interface CountryInfo {
	code: CountryCode;
	name: string;
	flag: string;
	currency?: string;
}

export interface MediaItem {
	id: number;
	title: string;
	overview: string;
	posterPath: string | null;
	backdropPath: string | null;
	mediaType: 'movie' | 'tv';
	releaseDate: string;
	releaseYear: string;
	voteAverage: number;
	voteCount: number;
	originCountry: string[];
	certification?: string | null;
	overseerrStatus?: OverseerrMediaStatus;
}

export enum OverseerrMediaStatus {
	UNKNOWN = 1,
	PENDING = 2,
	PROCESSING = 3,
	PARTIALLY_AVAILABLE = 4,
	AVAILABLE = 5
}

export interface CarouselSection {
	id: string;
	title: string;
	subtitle?: string;
	icon: string;
	items: MediaItem[];
}

export interface DiscoverResponse {
	country: CountryCode;
	countryInfo: CountryInfo;
	dateRange: DateRangeFilter;
	trendingTV: MediaItem[];
	acclaimedTV: MediaItem[];
	popularMovies: MediaItem[];
	acclaimedMovies: MediaItem[];
	tmdbConfigured: boolean;
	overseerrConfigured: boolean;
}

export interface RequestPayload {
	mediaId: number;
	mediaType: 'movie' | 'tv';
	seasons?: 'all' | number[];
}

export interface RequestResult {
	success: boolean;
	status?: OverseerrMediaStatus;
	message?: string;
	error?: string;
}
