import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';

const DATASET_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const DATASET_HEADER = 'tconst\taverageRating\tnumVotes';
const targetPath = resolve(process.env.IMDB_RATINGS_PATH || 'data/title.ratings.tsv.gz');

async function validateDataset(path) {
	const lines = createInterface({
		input: createReadStream(path).pipe(createGunzip()),
		crlfDelay: Infinity
	});

	for await (const line of lines) {
		if (line !== DATASET_HEADER) throw new Error('Downloaded file is not an IMDb ratings dataset');
		return;
	}

	throw new Error('Downloaded IMDb ratings dataset is empty');
}

async function update() {
	await mkdir(dirname(targetPath), { recursive: true });
	const temporaryPath = `${targetPath}.tmp-${process.pid}`;

	try {
		const response = await fetch(DATASET_URL);
		if (!response.ok || !response.body) {
			throw new Error(`IMDb dataset download failed with ${response.status} ${response.statusText}`);
		}

		await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
		await validateDataset(temporaryPath);
		await rename(temporaryPath, targetPath);
		console.log(`[IMDb] Updated ratings dataset at ${targetPath}`);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

const watch = process.argv.includes('--watch');
do {
	try {
		await update();
	} catch (error) {
		console.error('[IMDb] Ratings update failed:', error);
		if (!watch) process.exitCode = 1;
	}

	if (watch) await sleep(24 * 60 * 60 * 1000);
} while (watch);
