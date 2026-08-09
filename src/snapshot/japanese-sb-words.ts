import bundledSnapshotJson from './japanese-sb-words.snapshot.json';
import type { AnnotatedToken, SBWordRow2 } from '../types';

// Reuse the existing Supabase words2 row type instead of maintaining a Japanese
// duplicate. The semantic alias still makes it clear that this array contains
// the JA→EN and EN→JA subset bundled for MyJa.
export type JapaneseSBWords = SBWordRow2[];

// The wrapper fields let clients determine whether their local rows are stale
// without changing the familiar JapaneseSBWords row shape itself.
export type JapaneseSBWordsSnapshot = {
	schemaVersion: 1;
	version: string;
	generatedAt: string;
	rows: JapaneseSBWords;
};

export type JapaneseSBWordsSnapshotRefreshResult = {
	updated: boolean;
	version: string;
	count: number;
};

// This checked-in snapshot is MyJa's always-available offline starting point.
// `npm run export:ja-sbwords` regenerates it from words2 before a release/build.
const bundledSnapshot = bundledSnapshotJson as JapaneseSBWordsSnapshot;

// Extracted MyJa clients can use this public endpoint without importing any
// lingoprocessor/Supabase code. A manual refresh may override endpointUrl.
const defaultRefreshEndpoint = 'https://lingoprocessor.omnilingualaccess.com/api/japanese-sb-words';
const refreshIntervalMs = 24 * 60 * 60 * 1000;
// A temporarily offline client may retry sooner than one day, but repeated
// annotations will not cause a tight loop of failed network requests.
const failedRefreshRetryMs = 15 * 60 * 1000;

// IndexedDB works in normal web pages, Chrome extension pages, and extension
// service workers. It can hold this dataset without localStorage's small limit.
const databaseName = 'my-ja';
const storeName = 'japanese-sb-words';
const recordKey = 'current';

// One object is stored rather than thousands of individual word records because
// MyJa consumes the complete snapshot and replaces it atomically on refresh.
type StoredJapaneseSBWords = {
	key: typeof recordKey;
	snapshot: JapaneseSBWordsSnapshot;
	lastCheckedAt: number;
};

// Module memory is the fast path after the first annotation. The promise fields
// also prevent simultaneous annotations from duplicating IndexedDB/network work.
let activeSnapshot = bundledSnapshot;
let lastCheckedAt = 0;
let lastFailedAt = 0;
let persistentStateLoaded = false;
let loadPromise: Promise<void> | undefined;
let refreshPromise: Promise<JapaneseSBWordsSnapshotRefreshResult> | undefined;

function supportsPersistentJapaneseSBWords(): boolean {
	// Node/server consumers have no IndexedDB, so they stay deterministic and do
	// not silently make network requests. They may pass latestSBWords.
	return typeof indexedDB !== 'undefined';
}

function isJapaneseSBWordsSnapshot(value: unknown): value is JapaneseSBWordsSnapshot {
	// Both IndexedDB and the refresh endpoint are external inputs at runtime.
	// Validate every row before replacing the known-good bundled/current copy.
	if (!value || typeof value !== 'object') return false;
	const snapshot = value as Partial<JapaneseSBWordsSnapshot>;
	if (snapshot.schemaVersion !== 1 || typeof snapshot.version !== 'string' || !Array.isArray(snapshot.rows)) return false;
	return snapshot.rows.every(row =>
		row && typeof row === 'object'
		&& typeof row.id === 'number'
		&& typeof row.word_lang === 'string'
		&& typeof row.word === 'string'
		&& typeof row.gloss === 'string'
		&& typeof row.gloss_lang === 'string'
		&& typeof row.is_core === 'boolean'
		&& typeof row.created_at === 'string'
		&& typeof row.is_human_verified === 'boolean'
	);
}

function openDatabase(): Promise<IDBDatabase> {
	// IndexedDB uses event callbacks; wrap them in a Promise so the rest of this
	// module can use straightforward async/await control flow.
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'key' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function readStoredSnapshot(): Promise<StoredJapaneseSBWords | undefined> {
	const database = await openDatabase();
	try {
		return await new Promise((resolve, reject) => {
			const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(recordKey);
			request.onsuccess = () => resolve(request.result as StoredJapaneseSBWords | undefined);
			request.onerror = () => reject(request.error);
		});
	} finally {
		database.close();
	}
}

async function writeStoredSnapshot(record: StoredJapaneseSBWords): Promise<void> {
	const database = await openDatabase();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(storeName, 'readwrite');
			transaction.objectStore(storeName).put(record);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} finally {
		database.close();
	}
}

async function loadPersistentState(): Promise<void> {
	// Read IndexedDB only once per loaded MyJa module. If it is unavailable or
	// corrupt, annotation safely continues with the checked-in snapshot.
	if (persistentStateLoaded || !supportsPersistentJapaneseSBWords()) return;
	loadPromise ??= (async () => {
		try {
			const stored = await readStoredSnapshot();
			if (stored && isJapaneseSBWordsSnapshot(stored.snapshot)) {
				activeSnapshot = stored.snapshot;
				lastCheckedAt = stored.lastCheckedAt || 0;
			}
		} catch (error) {
			console.warn('MyJa could not read its cached JapaneseSBWords; using the bundled copy.', error);
		} finally {
			persistentStateLoaded = true;
		}
	})();
	await loadPromise;
}

// Returns using local data only (IndexedDB when present, otherwise the bundle).
// It starts, but deliberately does not await, the possible network refresh so
// an annotation is never delayed by connectivity.
export async function getSnapshotJapaneseSBWords(): Promise<JapaneseSBWords> {
	await loadPersistentState();
	if (supportsPersistentJapaneseSBWords() && typeof fetch !== 'undefined') {
		void refreshJapaneseSBWordsSnapshot().catch(() => undefined);
	}
	return activeSnapshot.rows;
}

// Consumers may call this with force=true for a user-facing "refresh" action.
// Automatic calls are conditional and at most daily; failures retain local data.
export async function refreshJapaneseSBWordsSnapshot({
	force = false,
	endpointUrl = defaultRefreshEndpoint,
}: {
	force?: boolean;
	endpointUrl?: string;
} = {}): Promise<JapaneseSBWordsSnapshotRefreshResult> {
	await loadPersistentState();
	const now = Date.now();
	if (!force && (now - lastCheckedAt < refreshIntervalMs || now - lastFailedAt < failedRefreshRetryMs)) {
		return { updated: false, version: activeSnapshot.version, count: activeSnapshot.rows.length };
	}
	if (typeof fetch === 'undefined') {
		return { updated: false, version: activeSnapshot.version, count: activeSnapshot.rows.length };
	}
	// Share one request if several annotations/manual refreshes arrive together.
	if (refreshPromise) return refreshPromise;

	refreshPromise = (async () => {
		try {
			// Send the known content version as a query parameter rather than an
			// ETag. Some hosting layers replace application-generated ETags, whereas
			// this SHA-based version remains stable and still permits a bodyless 304.
			const requestUrl = new URL(
				endpointUrl,
				typeof location !== 'undefined' ? location.href : undefined,
			);
			requestUrl.searchParams.set('version', activeSnapshot.version);
			// A user-requested refresh also asks Lingoprocessor to revalidate its
			// short-lived server cache. The endpoint coalesces/rate-limits reloads.
			if (force) requestUrl.searchParams.set('refresh', '1');
			const response = await fetch(requestUrl, { cache: 'no-store' });
			if (response.status === 304) {
				lastCheckedAt = Date.now();
				if (supportsPersistentJapaneseSBWords()) {
					await writeStoredSnapshot({ key: recordKey, snapshot: activeSnapshot, lastCheckedAt });
				}
				return { updated: false, version: activeSnapshot.version, count: activeSnapshot.rows.length };
			}
			if (!response.ok) throw new Error(`JapaneseSBWords refresh failed with HTTP ${response.status}.`);
			const snapshot: unknown = await response.json();
			if (!isJapaneseSBWordsSnapshot(snapshot)) throw new Error('JapaneseSBWords refresh returned an unsupported shape.');

			const changed = snapshot.version !== activeSnapshot.version;
			activeSnapshot = snapshot;
			lastCheckedAt = Date.now();
			if (supportsPersistentJapaneseSBWords()) {
				await writeStoredSnapshot({ key: recordKey, snapshot: activeSnapshot, lastCheckedAt });
			}
			return { updated: changed, version: activeSnapshot.version, count: activeSnapshot.rows.length };
		} catch (error) {
			lastFailedAt = Date.now();
			throw error;
		} finally {
			refreshPromise = undefined;
		}
	})();

	return refreshPromise;
}

function preferredRow(rows: JapaneseSBWords, target: (row: SBWordRow2) => string): SBWordRow2 | undefined {
	// Match glossifyTokens2ii's established priority when duplicate rows exist:
	// verified+lowercase, verified, lowercase, and finally the first row.
	return rows.find(row => row.is_human_verified && target(row) === target(row).toLowerCase())
		?? rows.find(row => row.is_human_verified)
		?? rows.find(row => target(row) === target(row).toLowerCase())
		?? rows[0];
}

// Mirrors the existing SBWords preference order: direct JA→EN first, followed
// by reverse EN→JA, preferring verified and lowercase English entries.
export function applyJapaneseSBWordsGlosses(tokens: AnnotatedToken[], rows: JapaneseSBWords): AnnotatedToken[] {
	// Build indexes once for this annotation rather than scanning all ~7,800
	// rows separately for every token.
	const directByWord = new Map<string, JapaneseSBWords>();
	const reverseByJapaneseGloss = new Map<string, JapaneseSBWords>();
	for (const row of rows) {
		if (row.word_lang === 'ja' && row.gloss_lang === 'en') {
			const key = row.word.toLowerCase();
			directByWord.set(key, [...(directByWord.get(key) ?? []), row]);
		} else if (row.word_lang === 'en' && row.gloss_lang === 'ja') {
			const key = row.gloss.toLowerCase();
			reverseByJapaneseGloss.set(key, [...(reverseByJapaneseGloss.get(key) ?? []), row]);
		}
	}

	return tokens.map(token => {
		// Non-words (for example `。`) intentionally keep null/absent glosses.
		// Existing deterministic/contextual glosses are also not overwritten.
		if (!token.isWord || token.gloss) return token;
		const key = token.text.toLowerCase();
		const direct = preferredRow(directByWord.get(key) ?? [], row => row.gloss);
		if (direct) return { ...token, gloss: direct.gloss };
		const reverse = preferredRow(reverseByJapaneseGloss.get(key) ?? [], row => row.word);
		return reverse ? { ...token, gloss: reverse.word } : token;
	});
}
