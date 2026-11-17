# ja-snap-annotator

An offline-first TypeScript library that tokenizes Japanese, supplies hiragana readings, and adds English word glosses when known.

## Use

```ts
import { annotate } from "ja-snap-annotator";

const tokens = await annotate("猫のひげは高い。");
```

Each token contains `text`, `isWord`, and—when available—`phoneticToken` and `gloss`. Glosses come from Contextual Rules, then the words2 snapshot, then from JMdict's English (see below); a word neither knows keeps a `null`/absent gloss, which an outer application (like word translation via lingop) can fill.

The library does not require an internet connection. It ships with Kuromoji's dictionary and a bundled JapaneseSBWords snapshot. In browser and Chrome-extension environments it checks once every 24 hours for a newer snapshot, stores it in IndexedDB, and keeps using local data if the check fails. A consumer can request an immediate check with `refreshJapaneseSBWordsSnapshot({ force: true })`.

For browser packaging, copy Kuromoji's `dict` directory into a locally served asset directory and configure its URL before the first annotation:

```ts
import { configure } from "ja-snap-annotator";

configure({ dictionaryPath: "/kuromoji-dict/" });
```

## Development

```sh
npm install
npm test
```

`npm run snapshot:update` regenerates the bundled snapshot when the Supabase URL and anon/service key environment variables are present. Normal builds retain the checked-in snapshot when they are not configured.

## Dictionary readings and alignment

Japanese word readings use Kuromoji/Kuroshiro first, then exact complete-word matches from the bundled [JMdictFurigana](https://github.com/Doublevil/JmdictFurigana) resource. It supplies dictionary readings together with their character spans. The resolver preserves lexical token boundaries and glosses; it skips ambiguous alternatives unless the current reading matches one, and never splits indivisible multi-kanji readings. Existing color, symbol, counter and other handwritten treatments remain in place and authoritative.

`resolveJapaneseReadings(tokens, protectedText?)` can also repair cached annotations without re-tokenizing them. Use `protectedText` for any caller-owned manually verified word or character readings. Built-in protected readings also apply to cached annotations and `spellTokens`. Known isolated-character readings are retained; missing ones can now be recovered when the dictionary offers an unambiguous reading.

When a phonetic part still contains kanji, a second pass uses aligned dictionary word context and kana stems to recover missing readings across tokenizer boundaries (for example, `咥` + `えた`, `憑` + `りつかれた`, and `頑` + `なに`). It selects the longest matching context and leaves tied alternatives unresolved. It preserves token boundaries, glosses, existing kana readings and indivisible kanji groups. It does not assign a universal reading to each kanji. No additional runtime dependency, remote request, or dictionary download is required.

A small lexical supplement covers terms absent from the dictionary and interrupted dialogue. The 52-character regression set is in `scripts/data/missing-reading-coverage.json`. The idempotent data patch in `scripts/data/ensure-missing-reading-glosses.sql` supplies JA→EN character and word glosses in Supabase `words2`; the corresponding rows are also bundled for offline use. New rows remain `is_human_verified = false`.

Source text needs separate editorial review: `受け就ぐ` appears to mean `受け継ぐ` (read as うけつぐ); `相會` in the supplied dialogue likely corrupts `相手`, but this package retains literal 會=かい rather than inventing that correction. `空鬱` is unusual and is given only a literal くううつ reading. These readings do not certify those spellings as standard Japanese. The Japanese lines establish lexical context; their English translations help interpret intended meanings. Partial romaji helps locate failed spans but is not trusted as a pronunciation reference. Subtitle IDs help locate source corrections, but are unnecessary for dictionary lookup.

### Optional broader analyzers

For a larger future fallback, [Sudachi / SudachiDict](https://github.com/WorksApplications/SudachiDict) is commercially usable under Apache-2.0, subject to the included third-party notices. Run it as an optional developer-side or server-side audit and incorporate reviewed lexical additions into the shipped data. Bundling its analyzer and additional dictionaries into every browser consumer would add substantial assets and integration work. Current V1 dictionaries require compatible Sudachi/SudachiPy versions; pin the analyzer and dictionary together. It provides morphology/readings, not English glosses.

Neither dictionary can guarantee readings for arbitrary names, invented words, or corrupt source text. Note that this project's own `LICENSE.md` is currently CC BY-NC-SA 4.0; commercial permission for upstream dictionaries does not change this repository's source license.

The index is generated, not maintained as a word exception list. Run `npm run readings:update` monthly to import the latest published dictionary, then build, test and release. For a reproducible import: `node scripts/import-jmdict-furigana.mjs /path/to/JmdictFurigana.json <release-tag>`. Normal builds and annotations remain offline. Source release, SHA-256 and attribution are recorded in `src/readings/jmdict-furigana-source.json`.

Reading data is derived from JMdict (© Jim Breen / EDRDG) and Doublevil's JMdictFurigana, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see `THIRD_PARTY_NOTICES.md` and `licenses/`. The generated data remains under that license, separately from this library's source license. Consumer apps should retain source acknowledgement in their documentation or Sources/About page.

## English glosses from JMdict

A word the words2 snapshot has no row for (路面 road surface, 運賃 fare, 交番 police box, きっぷ ticket, エレベーター elevator) takes an English gloss from [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project), offline. It is always on, with no option. Order of precedence: words2 rows, then the dictionary form's words2 row (答えて → 答える), then JMdict, then the context rules and counter glosses, which still override all of them.

- **Words with kanji** use a gloss column added to the reading index (`src/readings/jmdict-furigana.json`), picked by spelling *and* resolved reading (角 かど corner, 角 かく angle). Without a matching reading, a spelling's gloss is used only when all its readings agree, so a wrong reading gives a wrong gloss or none.
- **Words in kana** use `src/glosses/jmdict-kana-glosses.json`, keyed as written. A kana form that may be several words gets all their glosses, joined by " / ", words usually written in kana first (かど, 過度 or 角: "excessive / corner"; あめ: "candy / rain").
- **Inflected words** use their dictionary form's gloss with the base-form fallback's rules (kanji dictionary forms only).
- **Content words only:** particles, auxiliaries, symbols, numbers, proper nouns and dependent nouns (こと, ため) are never glossed from JMdict, nor are fragments of a kana word Kuromoji has split (み + らい, うり + ば). Names Kuromoji takes for common nouns (大橋 large bridge) get literal glosses.

Glosses are converted to the snapshot's short learner style at import time (one sense, one short gloss, no brackets, no "to" on verbs, no leading article); the rules are documented in `scripts/jmdict-gloss-style.mjs`. `npm run glosses:update` re-imports from the [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) release recorded in `src/glosses/jmdict-glosses-source.json` (the only online step); `npm run glosses:update -- <release tag>` picks another release, and `node --max-old-space-size=6144 scripts/import-jmdict-glosses.mjs /path/to/jmdict-eng.json <release tag>` imports a local file. Run it after `npm run readings:update`, using a JMdict release close to the reading index's.

Cost to consumers (measured against 0.1.2): the reading index grows from 2.2 to 3.2 MB brotli and the kana glosses add 0.6 MB (about +1.7 MB transferred in a browser build, about +9% of what it loads with Kuromoji's dictionary); the packaged `dist` grows from 3.8 to 6.5 MB gzip; Node heap after the first annotation grows by about 30 MB (250 → 280 MB) and the first annotation takes about 40 ms longer.

Gloss data is derived from JMdict (© Jim Breen / EDRDG) via jmdict-simplified, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), like the reading data. Glosses copied into stored annotations, word banks or printed material carry that licence and need attribution there too.

Create a prebuilt GitHub release asset with `npm run release:pack`; the archive in `releases/` includes compiled code, dictionary data and licenses, without install-time build scripts.
