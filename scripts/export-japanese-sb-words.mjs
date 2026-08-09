import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectDirectory = process.cwd();
const allowMissingConfiguration = process.argv.includes('--if-configured');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	if (allowMissingConfiguration) {
		console.log('Supabase is not configured; retaining the checked-in JapaneseSBWords snapshot.');
		process.exit(0);
	}
	throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

const fields = 'id, word_lang, word, gloss, gloss_lang, is_core, created_at, is_human_verified';

async function fetchDirection(wordLang, glossLang) {
	const rows = [];
	const pageSize = 1000;
	for (let from = 0; ; from += pageSize) {
		// Use Supabase's PostgREST endpoint directly so snapshot generation does
		// not become a runtime or development dependency of the annotator.
		const query = new URLSearchParams({
			select: fields,
			word_lang: `eq.${wordLang}`,
			gloss_lang: `eq.${glossLang}`,
			order: 'id.asc',
			offset: String(from),
			limit: String(pageSize),
		});
		const response = await fetch(`${supabaseUrl}/rest/v1/words2?${query}`, {
			headers: {
				apikey: supabaseKey,
				Authorization: `Bearer ${supabaseKey}`,
			},
		});
		if (!response.ok) throw new Error(`Supabase snapshot export failed with HTTP ${response.status}: ${await response.text()}`);
		const data = await response.json();
		rows.push(...data);
		if (data.length < pageSize) return rows;
	}
}

const rows = (await Promise.all([
	fetchDirection('ja', 'en'),
	fetchDirection('en', 'ja'),
])).flat().sort((a, b) => a.id - b.id);
const version = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const outputPath = resolve(projectDirectory, 'src/snapshot/japanese-sb-words.snapshot.json');

let existingVersion;
try {
	existingVersion = JSON.parse(await readFile(outputPath, 'utf8')).version;
} catch {
	// Missing/invalid snapshots are replaced below.
}

if (existingVersion === version) {
	console.log(`JapaneseSBWords snapshot is already current (${rows.length} rows, ${version.slice(0, 12)}).`);
} else {
	const snapshot = { schemaVersion: 1, version, generatedAt: new Date().toISOString(), rows };
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, JSON.stringify(snapshot));
	console.log(`Exported ${rows.length} JapaneseSBWords rows (${version.slice(0, 12)}) to ${outputPath}`);
}
