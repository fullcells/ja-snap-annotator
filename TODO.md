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

## Fix more words2 glosses seen in our texts

From a review of every words2 gloss shown in realworlddocs-universal-v10's JA · Travel worksheets, cl-translate's Japanese UI text and the regroup-list words (898 words; 17 Nov 2026), kept to senses that are wrong, not merely loose (a gloss repeated across ことが + できます, "can … can", is fine). Casing is left to the separate casing pass. Counts are tokens (T = JA · Travel, U = UI text).

*rule* = a context rule in `src/glosses/treatments.ts` now shows the right sense where learners meet it (transit and directions); the row is still worth fixing for other contexts. Rows without *rule* are wrong wherever they appear, so the fix belongs in words2 (static overrides in `src/glosses/overrides.ts` are deprecated).

**Approved: transit and directions**

| id | word | gloss now | new gloss | tokens | notes |
|---|---|---|---|---|---|
| 8438 | 乗り場 | platform | boarding place | 25 T | *rule*: stand after タクシー, stop after バス, pier after フェリー / 船; "platform" only for trains |
| 9849 | 案内 | guidance | information | 12 T | *rule* in a transit context (発車案内, 駅の案内) |
| 11179, 88568 | 降り, 降りて | descend | get off | 7 T | *rule* in a transit context |
| 8225 | ホーム | home | platform | 3 T | *rule* in a transit context; ホーム stays "home" elsewhere (ホームに戻る) |
| 51933 | 前 | fore | front; before | 3 T | *rule*: front after の (駅の前), before after a time (5分前). *verified* |
| 8653 | 先 | destination | ahead; first | 3 T | *rule*: first before に (先に着く), ahead after の / その |
| 11168 | 間 | while | between | 4 T | *rule*: after の or in A〜B間 |
| 7627 | より | ⤺ more | than; from | 10 T U | *rule*: from after a time (9時より), than after a noun (平日より); より before an adjective keeps "more". *verified* |
| 8898 | 台 | stand | (hour) range; (vehicles) | 4 T | *rule*: (hour) range after 時 (7時台); (vehicle) / (vehicles) after a number |
| 9757 | 書 | book | document | 3 T | *rule* after a noun (予約確認書) |
| 10426 | 窓口 | window | ticket counter | 1 T | *rule* in a transit context |
| 10332 | 着 | wear | arrival | 1 T | *rule* after a time (08:13着). Also a static override "着": "wear" |
| 49629 | 丁目 | Chome | block | 1 T | *rule* after a number (桜町一丁目) |
| 86822 | 歩いて | walking | walk | 20 T | |
| 7046 | お | ō | (polite) | 14 T U | honorific prefix, like ご (polite) |
| 10334 | 着き | Arrival | arrive | 10 T | 着きたい |
| 50968 | 友だち | Friends | friend | 8 T | |
| 85655 | 教えて | Tell me | tell | 8 T | |
| 7026 | いつも | everytime | always | 5 T | |
| 7387 | とき | time | when | 1 T | 運転するとき |
| 11006 | 通過 | passage | passes (without stopping) | 2 T | also a static override "通過": "passage", which wins over the row: remove it too |
| 80496 | 線路 | Line | track | 1 T | |
| 10271 | 発売 | Release | on sale | 1 T | 発売当日かぎり有効 |
| 50389 | 当日 | day | same day | 1 T | |
| 71490, 8908 | 日間, 号 | day, issue | days, number | 4 T | already shown right after a number |
| 6922 … | 1, 2, 10, 21 | one, two, ten, twenty one | 1, 2, 10, 21 | 54 T U | done in code: numbers in digits now gloss as themselves (the numbers treatment) |

(で "within" and その "the" were in the first draft of this list, but static overrides already show "-" and "that".)

**Approved: UI text**

| id | word | gloss now | new gloss | tokens | notes |
|---|---|---|---|---|---|
| 81948 | しています | wearing(is) | doing | 3 U | サポートしています |
| 7557 | まま | Mama | as it is | 2 U | 現在のままです |
| 7070 | おり | cage | (humble) be | 2 U | 信じており |
| 49416 | ござい | Yes | (polite) be | 1 U | 申し訳ございません |
| 49423 | 設定 | establishment | settings | 4 U | |

**Not yet reviewed** (in the UI text; clearly wrong, by the same bar): お送り *Pick-up* → send (お送りください); たび *Tabi* → every time (使うたびに); 元 *yuan* → original (元のテキスト); 向上 *Up* → improve; 基本的 *usually* → basic; ほど *moderation* → the more… (高くなるほど). Also ありがとうございます and 始めましょう have only EN→JA rows (read in reverse as *thankyou*, *Get started*): add JA→EN rows.

## Retire the regroup list

`src/treatments/token-regroups.ts` is down to 35 entries; units now come from words2 rows and JMdict nouns (dictionary-guided merging) and from the numbers treatment. To delete the file:

1. **Delete words2 rows that are not units.** Merging does not yet trust rows with a particle at either end, because these exist: 私は, 私の, 私たちは, 彼に, 彼女は, それは, 多くの, いくつかの, 前に (2 rows), の隣に, そこには, 誰が, どれの, ドアのところで, 私のドアの前で, 私のドアの前に, がある (2 rows), 赤ちゃんで, 話し合いで, 力も, ぐらいで, ですが. (Rows with a particle inside are trusted already; a few of those are sentence fragments too and would join in text: 彼は飲む, 彼は望んでいる, 彼らは望んでいる, 家のドア, 水を飲む.)
2. **Delete or correct fragment rows** (not words; the base-form fallback now glosses verb stems by their dictionary form): 歩か, 祝わ, 空か, にじん (にんじん?), 届か, さらさ, 尽くさ, けて, なさ, うたわ, あな, くして, 見当たり, いただけ.
3. **Decide には**: it has a verified row (`:`), but it is meant to stay に + は. Delete the row, or keep it and add には → に + は to `tokenSplits` in `annotate.ts`.
4. **Add rows** for the list entries words2 lacks: 魔水, 早く起きる, 気をつけて, お腹がすいた, お腹がすい, 喉が渇い, 歳をとった, 歳を取った, 疲れていて, ワクワクしてます, 具合が悪そう. Drop the fragments くした, おらず, ほしがり from the list instead. Then run `npm run snapshot:update` (online).
5. **Then in code**: let JA→EN words2 rows join with a particle at either end (`joinable` in `src/treatments/dictionary-merges.ts`; EN→JA rows read in reverse, such as あなたの and どちらか, should not license these joins). The 18 particle phrases on the list (とは, の上, 上に, ことが …) already have rows, so they then come from words2 alone. One visible change: カフェの間に becomes の間 + に (between + at) instead of の + 間に, as merging reads left to right; give てしまいます a row or merge before the te-form merge, and delete `token-regroups.ts` with its `regroupAnnotatedTokens` call. The base-form and JMdict fallbacks use the list as "deliberate groupings"; merged tokens already have a gloss, so they are left alone either way.
