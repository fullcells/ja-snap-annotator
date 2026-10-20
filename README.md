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

`resolveJapaneseReadings(tokens, protectedText?)` can also repair cached annotations without re-tokenizing them. Use `protectedText` for any caller-owned manually verified word or character readings. Built-in protected readings also apply to cached annotations and `spellTokens`. Isolated single characters are not overridden.

The index is generated, not maintained as a word exception list. Run `npm run readings:update` monthly to import the latest published dictionary, then build, test and release. For a reproducible import: `node scripts/import-jmdict-furigana.mjs /path/to/JmdictFurigana.json <release-tag>`. Normal builds and annotations remain offline. Source release, SHA-256 and attribution are recorded in `src/readings/jmdict-furigana-source.json`.

Reading data is derived from JMdict (© Jim Breen / EDRDG) and Doublevil's JMdictFurigana, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see `THIRD_PARTY_NOTICES.md` and `licenses/`. The generated data remains under that license, separately from this library's source license. Consumer apps should retain source acknowledgement in their documentation or Sources/About page.

Create a prebuilt GitHub release asset with `npm run release:pack`; the archive in `releases/` includes compiled code, dictionary data and licenses, without install-time build scripts.
