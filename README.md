# ja-snap-annotator

An offline-first TypeScript library that tokenizes Japanese, supplies hiragana readings, and adds English word glosses when known.

## Use

```ts
import { annotate } from "ja-snap-annotator";

const tokens = await annotate("猫のひげは高い。");
```

Each token contains `text`, `isWord`, and—when available—`phoneticToken` and `gloss`. Unknown word glosses may be `null`/absent, allowing an outer application to fill them.

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

[JMdict](https://www.edrdg.org/edrdg/licence.html) can additionally supply English glosses through a developer-side import under CC BY-SA 4.0 with attribution, share-alike for derived data and regular updates. It is commercially usable. Reusing the already bundled JMdictFurigana data is the lowest-load first step, and is the implemented default. Neither dictionary can guarantee readings for arbitrary names, invented words, or corrupt source text. Note that this project's own `LICENSE.md` is currently CC BY-NC-SA 4.0; commercial permission for upstream dictionaries does not change this repository's source license.

The index is generated, not maintained as a word exception list. Run `npm run readings:update` monthly to import the latest published dictionary, then build, test and release. For a reproducible import: `node scripts/import-jmdict-furigana.mjs /path/to/JmdictFurigana.json <release-tag>`. Normal builds and annotations remain offline. Source release, SHA-256 and attribution are recorded in `src/readings/jmdict-furigana-source.json`.

Reading data is derived from JMdict (© Jim Breen / EDRDG) and Doublevil's JMdictFurigana, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see `THIRD_PARTY_NOTICES.md` and `licenses/`. The generated data remains under that license, separately from this library's source license. Consumer apps should retain source acknowledgement in their documentation or Sources/About page.

Create a prebuilt GitHub release asset with `npm run release:pack`; the archive in `releases/` includes compiled code, dictionary data and licenses, without install-time build scripts.
