import { beforeAll, beforeEach, describe, expect, it, afterAll, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getImdbRating, getImdbRatings } from '$lib/server/imdb';
			'tconst\taverageRating\tnumVotes\ntt1234567\t8.4\t1200\ntt7654321\t7.1\t\\N'
const testEnv = vi.hoisted(() => ({
	IMDB_RATINGS_PATH: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: testEnv }));

let testDirectory: string;
let fileNumber = 0;

async function writeRatingsFile(contents: string): Promise<string> {
	const path = join(testDirectory, `ratings-${fileNumber++}.tsv.gz`);
	await writeFile(path, gzipSync(contents));
	return path;
}

describe('IMDb ratings dataset loader', () => {
	beforeAll(async () => {
		testDirectory = join(tmpdir(), `beavarr-imdb-${Date.now()}`);
		await mkdir(testDirectory, { recursive: true });
	});

	beforeEach(() => {
		testEnv.IMDB_RATINGS_PATH = undefined;
	});

	afterAll(async () => {
		await rm(testDirectory, { recursive: true, force: true });
	});

	it('parses ratings and vote counts by IMDb title ID', async () => {
		testEnv.IMDB_RATINGS_PATH = await writeRatingsFile(
			'tconst\taverageRating\tnumVotes\ntt1234567\t8.4\t1200\ntt7654321\t7.1\t\N'
		);

		const ratings = await getImdbRatings();

		expect(ratings?.get('tt1234567')).toEqual({ averageRating: 8.4, numVotes: 1200 });
		expect(await getImdbRating('tt7654321')).toBeNull();
	});

	it('returns null when the configured dataset is missing', async () => {
		testEnv.IMDB_RATINGS_PATH = join(testDirectory, 'missing.tsv.gz');

		expect(await getImdbRatings()).toBeNull();
	});

	it('reloads the dataset when the file changes', async () => {
		const path = join(testDirectory, 'reload.tsv.gz');
		testEnv.IMDB_RATINGS_PATH = path;
		await writeFile(path, gzipSync('tconst\taverageRating\tnumVotes\ntt1234567\t8.0\t10'));
		expect(await getImdbRating('tt1234567')).toEqual({ averageRating: 8, numVotes: 10 });

		await writeFile(path, gzipSync('tconst\taverageRating\tnumVotes\ntt1234567\t9.5\t1000'));
		expect(await getImdbRating('tt1234567')).toEqual({ averageRating: 9.5, numVotes: 1000 });
	});

	it('ignores malformed rows while loading valid rows', async () => {
		testEnv.IMDB_RATINGS_PATH = await writeRatingsFile(
			'tconst\taverageRating\tnumVotes\ninvalid\tbad\trow\ntt1234567\t8.2\t25'
		);

		expect(await getImdbRating('tt1234567')).toEqual({ averageRating: 8.2, numVotes: 25 });
	});
});
