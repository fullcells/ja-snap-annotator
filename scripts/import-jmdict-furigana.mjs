import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Explicit refresh: use a local upstream JSON file or fetch a chosen release.
let tag = process.argv[3];
if (process.argv[2] && !tag) throw new Error('Supply the source release tag with a local dictionary file.');
if (!tag) {
  const release = await fetch('https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest');
  if (!release.ok) throw new Error(`Dictionary release lookup failed: ${release.status}`);
  tag = (await release.json()).tag_name;
}
if (typeof tag !== 'string' || !tag) throw new Error('Dictionary release tag is missing.');
const source = `https://github.com/Doublevil/JmdictFurigana/releases/download/${encodeURIComponent(tag)}/JmdictFurigana.json`;
const response = process.argv[2] ? null : await fetch(source);
if (response && !response.ok) throw new Error(`Dictionary download failed: ${response.status}`);
const raw = process.argv[2] ? await readFile(process.argv[2]) : Buffer.from(await response.arrayBuffer());
const rows = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
const valid = rows.filter(row => typeof row.text === 'string' && /\p{Script=Han}/u.test(row.text) && Array.isArray(row.furigana) && row.furigana.map(p => p.ruby).join('') === row.text && row.furigana.map(p => p.rt ?? p.ruby).join('') === row.reading);
// Positional tuples keep the offline index compact; preserve all reading choices.
const entries = valid.map(row => [row.text, row.furigana.map(p => p.rt ? [p.ruby, p.rt] : [p.ruby])]);
// Keep the English gloss column (scripts/import-jmdict-glosses.mjs) for entries whose spelling and reading are unchanged;
// run `npm run glosses:update` afterwards to gloss new entries.
const toHiragana = s => s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const formKey = (text, parts) => `${text}\t${toHiragana(parts.map(p => p[1] ?? p[0]).join(''))}`;
const previousIndex = await readFile('src/readings/jmdict-furigana.json', 'utf8').then(s => JSON.parse(s.replace(/^\uFEFF/, ''))).catch(() => []);
const glosses = new Map(previousIndex.filter(e => e[2]).map(([text, parts, gloss]) => [formKey(text, parts), gloss]));
for (const entry of entries) { const gloss = glosses.get(formKey(entry[0], entry[1])); if (gloss) entry.push(gloss); }
await mkdir('src/readings', { recursive: true });
await writeFile('src/readings/jmdict-furigana.json', JSON.stringify(entries));
await writeFile('src/readings/jmdict-furigana-source.json', JSON.stringify({tag,source,sha256:createHash('sha256').update(raw).digest('hex'),entries:entries.length,license:'CC-BY-SA-4.0',attribution:'JMdict © EDRDG / Jim Breen; furigana alignment by Doublevil / JmdictFurigana.',documentation:'https://github.com/Doublevil/JmdictFurigana',licenseUrl:'https://www.edrdg.org/edrdg/licence.html'},null,2)+'\n');
console.log(`Imported ${entries.length} aligned dictionary readings (${Buffer.byteLength(JSON.stringify(entries))} bytes).`);
