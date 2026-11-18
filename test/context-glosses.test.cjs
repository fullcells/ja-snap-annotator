// Context senses (src/glosses/treatments.ts): common words whose words2 row gives a sense that is wrong where learners
// meet them. Each rule fires only in its context; elsewhere the row's gloss stays (the rows themselves are fixed in words2).
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate} = require('../dist');
const token = async (text, word) => (await annotate(text)).find(t => t.text === word);
const gloss = async (text, word) => (await token(text, word))?.gloss;

test('〇をつけて: mark, not attach', async () => {
	assert.equal(await gloss('正しいほうに〇をつけてください。', 'つけて'), 'mark');
	assert.equal(await gloss('×をつけてください', 'つけて'), 'mark');
	assert.notEqual(await gloss('帽子をつけてください', 'つけて'), 'mark');
});

test('ほう: (the) one in a choice or comparison, direction after の', async () => {
	assert.equal(await gloss('正しいほうに〇をつけてください。', 'ほう'), '(the) one');
	assert.equal(await gloss('急行のほうが速いです', 'ほう'), '(the) one');
	assert.equal(await gloss('出口のほうです', 'ほう'), 'direction');
});

test('曲がる in directions: turn', async () => {
	assert.equal(await gloss('右に曲がってください', '曲がって'), 'turn');
	assert.equal(await gloss('角を左に曲がります', '曲がり'), 'turn');
	assert.notEqual(await gloss('曲がった釘', '曲がった'), 'turn');
});

test('角 on its own is かど, a corner; compounds keep their reading', async () => {
	const t = await token('カフェは角にあります', '角');
	assert.equal(t.gloss, 'corner');
	assert.deepEqual(t.phoneticToken, [['角', 'かど']]);
	assert.equal((await token('角', '角')).phoneticToken[0][1], 'かど');
	assert.equal((await token('三角', '三角')).phoneticToken.map(p => p[1]).join(''), 'さんかく');
});

test('普通: local (train) in a transit context, the row elsewhere; 普通免許 is one word', async () => {
	assert.equal(await gloss('普通だけ止まる駅', '普通'), 'local (train)');
	assert.equal(await gloss('8時7分の普通', '普通'), 'local (train)');
	assert.equal(await gloss('普通免許', '普通免許'), "ordinary driver's license"); // one word now (dictionary-guided merging)
	assert.ok(!['local (train)', 'standard (licence)'].includes(await gloss('普通は高い', '普通')));
});

test('行き after a place: bound for; 行きます stays the verb', async () => {
	assert.equal(await gloss('新町行きの電車', '行き'), 'bound for');
	assert.equal(await gloss('どこ行きですか', '行き'), 'bound for');
	for (const text of ['空港に行きます', 'どうやって行きますか', '行きたいです'])
		assert.notEqual(await gloss(text, '行き'), 'bound for', text);
});

test('transit and direction senses, only in their context', async () => {
	assert.equal(await gloss('このホームの電車は急行です', 'ホーム'), 'platform');
	assert.notEqual(await gloss('ホームに戻る', 'ホーム'), 'platform'); // no transit context: the row stays
	assert.equal(await gloss('大橋で降りて、電車に乗ります', '降りて'), 'get off');
	assert.equal(await gloss('駅の発車案内を見ます', '案内'), 'information');
	assert.equal(await gloss('駅の窓口できっぷを買います', '窓口'), 'ticket counter');
	assert.equal(await gloss('バスは各駅の前から出ます', '前'), 'front');
	assert.equal(await gloss('5分前に着きます', '前'), 'before');
	assert.equal(await gloss('高田に先に着くのは', '先'), 'first');
	assert.equal(await gloss('08:13着', '着'), 'arrival');
	assert.equal(await gloss('平日より電車が少ないです', 'より'), 'than');
	assert.equal(await gloss('9時より営業します', 'より'), 'from');
	assert.notEqual(await gloss('通常、より高品質です', 'より'), 'than'); // より before an adjective: more
	assert.equal(await gloss('新町〜海岸間で運休します', '間'), 'between');
	assert.equal(await gloss('平日の7時台の電車', '台'), '(hour) range');
	assert.equal(await gloss('レンタカーの予約確認書', '書'), 'document');
	assert.equal(await gloss('花子さんが運転するとき、何が必要ですか。', 'とき'), 'when');
	assert.equal(await gloss('この駅は急行が通過します', '通過'), 'passes (without stopping)');
	assert.equal(await gloss('電車の線路', '線路'), 'track');
});

// Grammatical context (src/glosses/context-glosses.ts): fires only on explicit evidence; everything else keeps its gloss.
test('に by its verb: on (乗る), to (motion, telling); per between a period and a count', async () => {
	assert.equal(await gloss('電車に乗ります。', 'に'), 'on');
	assert.equal(await gloss('何に乗ってみたいですか。', 'に'), 'on');
	assert.equal(await gloss('家から歩いてどこに行けますか。', 'に'), 'to');
	assert.equal(await gloss('ここに来る途中に、何がありますか。', 'に'), 'to');
	assert.equal(await gloss('右に曲がってください', 'に'), 'to');
	assert.equal(await gloss('誰に聞きますか。', 'に'), 'to');
	assert.equal(await gloss('家族に連絡します', 'に'), 'to');
	const week = await annotate('週に一回'), month = await annotate('月に一回');
	assert.equal(week.find(t => t.text === 'に').gloss, 'per');
	assert.equal(month.find(t => t.text === 'に').gloss, 'per');
	assert.equal(month.find(t => t.text === '月').gloss, 'month');
});

test('に keeps its gloss without that evidence', async () => {
	const kept = (await annotate('家の近くに何がありますか。')).find(t => t.text === 'に').gloss;
	for (const text of [
		'一緒に行きましょう。',          // 一緒に: together, not "to"
		'ときに乗ります。',              // time に
		'旅行の前に、何を予約しますか。',  // time に
		'3時に駅に着きます',             // time に; 着く is not in the motion list
		'旅行に何を持っていきますか。',    // no verb right after に
		'どこに入れますか。',             // in
		'どこに泊まりたいですか。',        // at/in
	]) for (const t of (await annotate(text)).filter(t => t.text === 'に')) assert.equal(t.gloss, kept, text);
	assert.notEqual((await annotate('月')).find(t => t.text === '月').gloss, 'month'); // no context: the row stays
});

test('と with: a noun and a verb of doing together; otherwise kept', async () => {
	assert.equal(await gloss('誰と旅行したいですか。', 'と'), 'with');
	assert.equal(await gloss('駅で人と会うとき', 'と'), 'with');
	assert.equal(await gloss('友達と一緒に行きます', 'と'), 'with');
	const kept = await gloss('家族と', 'と');                                   // no verb: kept
	assert.equal(await gloss('パンと牛乳を買います', 'と'), kept);               // and
	assert.equal(await gloss('教室を出ると、トイレは右です', 'と'), 'when');      // the existing rule
	assert.equal(await gloss('何と言いますか', 'と'), '❞');                     // the existing rule
});

test('でも after a question word: -ever; otherwise kept', async () => {
	assert.equal(await gloss('どの席でもいいです。', 'でも'), '-ever');
	assert.equal(await gloss('何でもいいです', 'でも'), '-ever');
	assert.notEqual(await gloss('お茶でも飲みましょう', 'でも'), '-ever');
	assert.notEqual(await gloss('でも、雨です', 'でも'), '-ever');
});

test('聞く after に: ask; よく before knowing: well; 旅行中: during; この辺: area; 困ったとき: in trouble', async () => {
	assert.equal(await gloss('人に聞きます。', '聞き'), 'ask');
	assert.equal(await gloss('駅で困ったとき、誰に聞きますか。', '聞き'), 'ask');
	assert.equal(await gloss('音楽を聞きます', '聞き'), 'listen');
	assert.equal(await gloss('この辺はよく知りません。', 'よく'), 'well');
	assert.equal(await gloss('まだよくわかりません。', 'よく'), 'well');
	assert.equal(await gloss('よく電車に乗ります', 'よく'), 'often');
	assert.equal(await gloss('この辺はよく知りません。', '辺'), 'area');
	assert.equal(await gloss('旅行中、パスポートはどこですか', '中'), 'during');
	assert.equal(await gloss('電車の中で何をしますか。', '中'), 'inside');
	assert.equal(await gloss('駅で困ったとき、誰に聞きますか。', '困った'), 'in trouble');
});
