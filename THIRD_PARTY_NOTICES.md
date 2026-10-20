# Third-party notices

These components retain their original licenses and are excluded from the project's CC BY-NC-SA 4.0 grant except to the extent that the respective third-party licenses permit redistribution.

The customized files under `src/tokenization/my-kuroshiro/` are derived from [Kuroshiro](https://github.com/hexenq/kuroshiro), distributed under the MIT License:

> Copyright (c) 2015-2021 Hexen Qi
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice. The software is provided "AS IS", without warranty of any kind.

Runtime dependencies include:

- `kuroshiro-analyzer-kuromoji` — MIT License, Copyright (c) 2015-2018 Hexen Qi.
- `kuromoji` — Apache License 2.0, Copyright its respective contributors.

Complete dependency license texts are included by npm in their respective installed packages.

## Generated Japanese dictionary reading data

`src/readings/jmdict-furigana.json` (and its compiled copy) is a compact transformation of [JMdictFurigana](https://github.com/Doublevil/JmdictFurigana), by Doublevil, derived from JMdict, copyright Jim Breen and the Electronic Dictionary Research and Development Group (EDRDG). This data is licensed under Creative Commons Attribution-ShareAlike 4.0, not this project's CC BY-NC-SA license. The transformation removes invalid rows and non-Han entries, stores compact tuples and preserves reading alternatives/alignment. Exact source version and hash appear in `jmdict-furigana-source.json`.

Source: https://github.com/Doublevil/JmdictFurigana
Dictionary: https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project
License statement: https://www.edrdg.org/edrdg/licence.html
License: https://creativecommons.org/licenses/by-sa/4.0/
Copies of the upstream documentation and license are in `licenses/`.
