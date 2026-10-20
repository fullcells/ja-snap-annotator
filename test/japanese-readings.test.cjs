const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate, spellTokens, resolveJapaneseReadings} = require('../dist');
const reading = tokens => tokens.flatMap(t=>t.phoneticToken??[[t.text]]).map(p=>p[1]??p[0]).join('');
const words = {'太巻き':'ふとまき','握り寿司':'にぎりずし','巻き寿司':'まきずし','手巻き寿司':'てまきずし','いなり寿司':'いなりずし','ちらし寿司':'ちらしずし','押し寿司':'おしずし','かっぱ巻き':'かっぱまき'};
test('dictionary resolves complete sushi words without food-specific overrides', async()=>{
 for (const [text,expected] of Object.entries(words)) {
  const tokens=await annotate(text,{latestSBWords:[]});
  assert.equal(reading(tokens),expected,text);
  assert.equal(tokens.map(t=>t.text).join(''),text);
  for(const token of tokens) assert.equal(token.phoneticToken.map(p=>p[0]).join(''),token.text);
 }
});
test('cached whole-word annotations retain glosses and character alignment',()=>{
 const source=[{text:'太巻き',isWord:1,gloss:'thick sushi rolls',phoneticToken:[['太','ふとし'],['巻','ま'],['き','き']]}];
 const before=structuredClone(source);
 const result=resolveJapaneseReadings(source);
 assert.deepEqual(result[0].phoneticToken,[['太','ふと'],['巻','ま'],['き','き']]);
 assert.equal(result[0].gloss,source[0].gloss);
 assert.deepEqual(source,before);
});
test('ambiguous dictionary entries preserve the supplied reading',()=>{
 const source=[{text:'生物',isWord:1,phoneticToken:[['生物','なまもの']]}];
 assert.equal(reading(resolveJapaneseReadings(source)),'なまもの');
 const unknown=[{...source[0],phoneticToken:[['生物','unknown']]}];
 assert.deepEqual(resolveJapaneseReadings(unknown),unknown);
});
test('dictionary cannot split an indivisible reading across source token boundaries',()=>{
 const source=[{text:'大',isWord:1,phoneticToken:[['大','だい']]},{text:'人',isWord:1,phoneticToken:[['人','じん']]}];
 const result=resolveJapaneseReadings(source);
 assert.deepEqual(result.map(t=>t.text),['大','人']);
 assert.ok(result.every(t=>t.phoneticToken.map(p=>p[0]).join('')===t.text));
});
test('active handwritten color and counter readings remain authoritative',async()=>{
 assert.equal(reading(await annotate('緑色')),'みどりいろ');
 assert.equal(reading(await annotate('青色')),'あおいろ');
 assert.equal(reading(await annotate('1本')),'いっぽん');
 assert.equal(reading(await annotate('3匹')),'さんびき');
 const source=[{text:'太巻き',isWord:1,phoneticToken:[['太','manual'],['巻き','まき']]}];
 assert.deepEqual(resolveJapaneseReadings(source,new Set(['太'])),source);
});
test('punctuation and spaces prevent compound corrections crossing boundaries',()=>{
 const source=[{text:'太',isWord:1,phoneticToken:[['太','ふとし']]},{text:' ',isWord:0},{text:'巻き',isWord:1,phoneticToken:[['巻','ま'],['き','き']]}];
 assert.equal(reading(resolveJapaneseReadings(source)),'ふとし まき');
});

test('standalone spelling uses the same dictionary and built-in protections', async()=>{
 const source=[{text:'太巻き',isWord:1,gloss:'thick roll'}];
 const result=await spellTokens(source);
 assert.equal(reading(result),'ふとまき');
 assert.equal(result[0].gloss,'thick roll');
 const protectedParts=[{text:'緑色',isWord:1,phoneticToken:[['緑','みどり'],['色','いろ']]}];
 assert.deepEqual(resolveJapaneseReadings(protectedParts),protectedParts);
});
