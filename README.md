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
