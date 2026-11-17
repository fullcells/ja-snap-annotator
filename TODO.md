# To do

## Fix ten word glosses in Supabase `words2`

These `words2` rows (JA→EN, all `is_human_verified = false`) give the wrong primary sense for common learner vocabulary. Found by the annotation evaluation of realworlddocs-universal-v10's JA · Travel worksheets (`docs/annotations/annotator-evaluation.md` there; 22 worksheets, 4,593 word tokens). Fix them in `words2`, then run `npm run snapshot:update` (online) to refresh the bundled snapshot.

The context rules in `src/glosses/treatments.ts` already correct some of these in context (marked *rule*). Fixing the rows gives the right default everywhere else, including where a word stands alone (a timetable cell, a word box).

| id | word | gloss now | suggested gloss | tokens in JA · Travel | notes |
|---|---|---|---|---|---|
| 7520 | ほう | leans | side, way; (the) one | 13 | 正しいほうに〇, 急行のほうが速い, 出口のほうです. *rule* |
| 85497 | 曲がって | bent | turn | 12 | 右に曲がってください. *rule* |
| 9755 | 曲がる | bend | turn, bend | — | the base form of the above; "turn" is the learner sense |
| 50839 | 角 | Horn | corner | 10 | standalone 角 reads かど (corner); かく is the reading in compounds (三角, 角度). *rule* (reading too) |
| 7212 | さん | Sir | Mr./Ms. | 18 | honorific after a name (田中さん, 花子さん). *rule* |
| 9738 | 普通 | usually | normal, ordinary; local (train) | 44 | 普通 on timetables = local train; 普通免許 = standard licence. *rule* in a transit or licence context; 13 standalone timetable cells still get the row |
| 10673 | 行き | Going | going; bound for | 68 | 新町行き = bound for 新町; 行きます = go. *rule* for the destination sense |
| 10258 | 番線 | Platform wire | platform (number) | 31 | after a number already *platform* (numbers treatment); the row is still wrong on its own |
| 50933 | 際 | International | occasion, when | 2 | ご来店の際は (when you visit) |
| 50531 | 氏名 | identity | full name | 1 | on forms and licences |

Also worth a look while there: 図 *Figure* (map, diagram: 路線図), お持ち / 持ち *possession* (お持ちください please bring), つけて *attach* (also "put, mark": 〇をつけて is handled by a *rule*).

Casing (Hotel, Bank, Coast…) is a separate pass and not part of this list.
