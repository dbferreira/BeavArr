import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { env } from '$env/dynamic/private';

const DEFAULT_RATINGS_PATH = 'data/title.ratings.tsv.gz';
const RATINGS_HEADER = 'tconst\taverageRating\tnumVotes';

export interface ImdbRating {
	averageRating: number;
	numVotes: number;
}

let cachedRatings: {
	path: string;
	signature: string;
	ratings: ReadonlyMap<string, ImdbRating>;
} | null = null;
let ratingsLoad: Promise<ReadonlyMap<string, ImdbRating> | null> | null = null;

function getRatingsPath(): string {
	return env.IMDB_RATINGS_PATH?.trim() || DEFAULT_RATINGS_PATH;
}

async function getFileSignature(path: string): Promise<string | null> {
	try {
		const file = await stat(path);
		return `${file.size}:${file.mtimeMs}`;
	} catch {
		return null;
	}
}

async function readRatings(path: string): Promise<ReadonlyMap<string, ImdbRating>> {
	const ratings = new Map<string, ImdbRating>();
	const lines = createInterface({
		input: createReadStream(path).pipe(createGunzip()),
		crlfDelay: Infinity
	});
	let firstLine = true;

	for await (const line of lines) {
		if (firstLine) {
			firstLine = false;
			if (line !== RATINGS_HEADER) throw new Error('Unexpected IMDb ratings dataset header');
			continue;
		}

		const [tconst, averageRating, numVotes] = line.split('\t');
		const rating = Number(averageRating);
		const votes = Number(numVotes);
		if (/^tt\d+$/.test(tconst) && Number.isFinite(rating) && Number.isInteger(votes)) {
			ratings.set(tconst, { averageRating: rating, numVotes: votes });
		}
	}

	return ratings;
}

export async function getImdbRatings(): Promise<ReadonlyMap<string, ImdbRating> | null> {
	const path = getRatingsPath();
	const signature = await getFileSignature(path);
	if (!signature) return null;

	if (cachedRatings?.path === path && cachedRatings.signature === signature) {
		return cachedRatings.ratings;
	}

	if (ratingsLoad) return ratingsLoad;

	ratingsLoad = readRatings(path)
		.then((ratings) => {
			cachedRatings = { path, signature, ratings };
			return ratings;
		})
		.catch((error) => {
			console.warn(`[IMDb] Could not load ratings dataset at ${path}:`, error);
			return null;
		})
		.finally(() => {
			ratingsLoad = null;
		});

	return ratingsLoad;
}

export async function getImdbRating(tconst: string): Promise<ImdbRating | null> {
	const ratings = await getImdbRatings();
	return ratings?.get(tconst) ?? null;
}
