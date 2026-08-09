// 20250731: Note: This is currently a direct copy-paste port from lingoprocessor-v10
// NOTE: This has been edited to export JSON 'Tokens' instead of HTML-RUBY in FURIGANA MODE.

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// H: NODEJS Modue (CommonJS), NOT An ES6 Module (i.e. it does not support 'Imports and Exports')

var MyUtil = require("./util.js");
var nodesJsUtil = require("util");

exports.Util = MyUtil;

/**
 * Kuroshiro Class
 */
exports.Kuroshiro = class {
		/**
		 * Constructor
		 * @constructs Kuroshiro
		 */
		constructor() {
				this._analyzer = null;
		}

		/**
		 * Initialize Kuroshiro
		 * @memberOf Kuroshiro
		 * @instance
		 * @returns {Promise} Promise object represents the result of initialization
		 */
		async init(analyzer) {
				if (!analyzer || typeof analyzer !== "object" || typeof analyzer.init !== "function" || typeof analyzer.parse !== "function") {
						throw new Error("Invalid initialization parameter.");
				}
				else if (this._analyzer == null) {
						try {
								await analyzer.init();
								this._analyzer = analyzer;
						}
						catch (err) {
								throw err;
						}
				}
				else {
						throw new Error("Kuroshiro has already been initialized.");
				}
		}

		/**
		 * Convert given string to target syllabary with options available
		 * @memberOf Kuroshiro
		 * @instance
		 * @param {string} str Given String
		 * @param {Object} [options] Settings Object
		 * @param {string} [options.to="hiragana"] Target syllabary ["hiragana"|"katakana"|"romaji"]
		 * @param {string} [options.mode="normal"] Convert mode ["normal"|"spaced"|"okurigana"|"furigana"]
		 * @param {string} [options.romajiSystem="hepburn"] Romanization System ["nippon"|"passport"|"hepburn"]
		 * @param {string} [options.delimiter_start="("] Delimiter(Start)
		 * @param {string} [options.delimiter_end=")"] Delimiter(End)
		 * @returns {Promise} Promise object represents the result of conversion
		 */
		async convert(str, options) {
				options = options || {};
				options.to = options.to || "hiragana";
				options.mode = options.mode || "normal";
				options.romajiSystem = options.romajiSystem || MyUtil.ROMANIZATION_SYSTEM.HEPBURN;
				options.delimiter_start = options.delimiter_start || "(";
				options.delimiter_end = options.delimiter_end || ")";
				str = str || "";

				if (["hiragana", "katakana", "romaji"].indexOf(options.to) === -1) {
						throw new Error("Invalid Target Syllabary.");
				}

				if (["normal", "spaced", "okurigana", "furigana"].indexOf(options.mode) === -1) {
						throw new Error("Invalid Conversion Mode.");
				}

				const ROMAJI_SYSTEMS = Object.keys(MyUtil.ROMANIZATION_SYSTEM).map(e => MyUtil.ROMANIZATION_SYSTEM[e]);
				if (ROMAJI_SYSTEMS.indexOf(options.romajiSystem) === -1) {
						throw new Error("Invalid Romanization System.");
				}

				const rawTokens = await this._analyzer.parse(str);
				const tokens = MyUtil.patchTokens(rawTokens);

				if (options.mode === "normal" || options.mode === "spaced") {
						switch (options.to) {
								case "katakana":
										if (options.mode === "normal") {
												return tokens.map(token => token.reading).join("");
										}
										return tokens.map(token => token.reading).join(" ");
								case "romaji":
										const romajiConv = (token) => {
												let preToken;
												if (MyUtil.hasJapanese(token.surface_form)) {
														preToken = token.pronunciation || token.reading;
												}
												else {
														preToken = token.surface_form;
												}
												return MyUtil.toRawRomaji(preToken, options.romajiSystem);
										};
										if (options.mode === "normal") {
												return tokens.map(romajiConv).join("");
										}
										return tokens.map(romajiConv).join(" ");
								case "hiragana":
										for (let hi = 0; hi < tokens.length; hi++) {
												if (MyUtil.hasKanji(tokens[hi].surface_form)) {
														if (!MyUtil.hasKatakana(tokens[hi].surface_form)) {
																tokens[hi].reading = MyUtil.toRawHiragana(tokens[hi].reading);
														}
														else {
																// handle katakana-kanji-mixed tokens
																tokens[hi].reading = MyUtil.toRawHiragana(tokens[hi].reading);
																let tmp = "";
																let hpattern = "";
																for (let hc = 0; hc < tokens[hi].surface_form.length; hc++) {
																		if (MyUtil.isKanji(tokens[hi].surface_form[hc])) {
																				hpattern += "(.*)";
																		}
																		else {
																				hpattern += MyUtil.isKatakana(tokens[hi].surface_form[hc]) ? MyUtil.toRawHiragana(tokens[hi].surface_form[hc]) : tokens[hi].surface_form[hc];
																		}
																}
																const hreg = new RegExp(hpattern);
																const hmatches = hreg.exec(tokens[hi].reading);
																if (hmatches) {
																		let pickKJ = 0;
																		for (let hc1 = 0; hc1 < tokens[hi].surface_form.length; hc1++) {
																				if (MyUtil.isKanji(tokens[hi].surface_form[hc1])) {
																						tmp += hmatches[pickKJ + 1];
																						pickKJ++;
																				}
																				else {
																						tmp += tokens[hi].surface_form[hc1];
																				}
																		}
																		tokens[hi].reading = tmp;
																}
														}
												}
												else {
														tokens[hi].reading = tokens[hi].surface_form;
												}
										}
										if (options.mode === "normal") {
												return tokens.map(token => token.reading).join("");
										}
										return tokens.map(token => token.reading).join(" ");
								default:
										throw new Error("Unknown option.to param");
						}
				}
				else if (options.mode === "okurigana" || options.mode === "furigana") {
						const notations = []; // [basic, basic_type[1=kanji,2=kana,3=others], notation, pronunciation]
						const myTokens = {};
						myTokens.tokens = []; // H.

						// console.log('tokens', tokens);
						for (let i = 0; i < tokens.length; i++) {

								const strType = MyUtil.getStrType(tokens[i].surface_form);

								var tokenData = {}; // <- Gah, I accidentally had this as an array. This had me stuck for hours! ><. 2020.12.15 23.56
								tokenData.points = [];
								tokenData.strType = strType;
								tokenData.surfaceForm = tokens[i].surface_form;

								// + Kuromoji POS / dictionary data
								tokenData.pos = tokens[i].pos || null;
								tokenData.posDetail1 = tokens[i].pos_detail_1 || null;
								tokenData.posDetail2 = tokens[i].pos_detail_2 || null;
								tokenData.posDetail3 = tokens[i].pos_detail_3 || null;
								tokenData.basicForm = tokens[i].basic_form || null;
								tokenData.conjugatedType = tokens[i].conjugated_type || null;
								tokenData.conjugatedForm = tokens[i].conjugated_form || null;

								switch (strType) {
										case 0:
												notations.push([tokens[i].surface_form, 1, MyUtil.toRawHiragana(tokens[i].reading), tokens[i].pronunciation || tokens[i].reading]);

												var tokenDataSubs = {};
												tokenDataSubs.surfaceForm = tokens[i].surface_form;
												tokenDataSubs.miscNum = 1;
												tokenDataSubs.hiragana = MyUtil.toRawHiragana(tokens[i].reading);
												tokenDataSubs.katakana = tokens[i].pronunciation || tokens[i].reading;
												tokenDataSubs.isKanji = true;

												tokenData.points.push(tokenDataSubs);

												break;

										case 1:
												let pattern = "";
												let isLastTokenKanji = false;
												const subs = []; // recognize kanjis and group them

												for (let c = 0; c < tokens[i].surface_form.length; c++) {
														if (MyUtil.isKanji(tokens[i].surface_form[c])) {
																if (!isLastTokenKanji) { // ignore successive kanji tokens (#10)
																		isLastTokenKanji = true;
																		pattern += "(.*)";
																		subs.push(tokens[i].surface_form[c]);
																}
																else {
																		subs[subs.length - 1] += tokens[i].surface_form[c];
																}
														}
														else {
																isLastTokenKanji = false;
																subs.push(tokens[i].surface_form[c]);
																pattern += MyUtil.isKatakana(tokens[i].surface_form[c]) ? MyUtil.toRawHiragana(tokens[i].surface_form[c]) : tokens[i].surface_form[c];
														}
												}
												const reg = new RegExp(`^${pattern}$`);
												const matches = reg.exec(MyUtil.toRawHiragana(tokens[i].reading));
												if (matches) {
														let pickKanji = 1;
														for (let c1 = 0; c1 < subs.length; c1++) {
																if (MyUtil.isKanji(subs[c1][0])) {
																		notations.push([subs[c1], 1, matches[pickKanji], MyUtil.toRawKatakana(matches[pickKanji])]);

																		var tokenDataSubs = {};
																		tokenDataSubs.surfaceForm = subs[c1];
																		tokenDataSubs.miscNum = 1;
																		tokenDataSubs.hiragana = matches[pickKanji];
																		tokenDataSubs.katakana = MyUtil.toRawKatakana(matches[pickKanji]);
																		tokenDataSubs.isKanji = true;

																		// tokenData.points.push( JSON.parse(JSON.stringify(tokenDataSubs)) );
																		tokenData.points.push(tokenDataSubs);

																		pickKanji += 1;
																}
																else {
																		notations.push([subs[c1], 2, MyUtil.toRawHiragana(subs[c1]), MyUtil.toRawKatakana(subs[c1])]);

																		var tokenDataSubs = {};
																		tokenDataSubs.surfaceForm = subs[c1];
																		tokenDataSubs.miscNum = 2;
																		tokenDataSubs.hiragana = MyUtil.toRawHiragana(subs[c1]);
																		tokenDataSubs.katakana = MyUtil.toRawKatakana(subs[c1]);
																		tokenDataSubs.isKanji = false;

																		tokenData.points.push(tokenDataSubs);
																		// tokenData.points.push( JSON.parse(JSON.stringify(tokenDataSubs)) );

																}
														}
												}
												else {
														notations.push([tokens[i].surface_form, 1, MyUtil.toRawHiragana(tokens[i].reading), tokens[i].pronunciation || tokens[i].reading]);

														var tokenDataSubs = {};
														tokenDataSubs.surfaceForm = tokens[i].surface_form;
														tokenDataSubs.miscNum = 1;
														tokenDataSubs.hiragana = MyUtil.toRawHiragana(tokens[i].reading);
														tokenDataSubs.katakana = tokens[i].pronunciation || tokens[i].reading;
													tokenDataSubs.isKanji = true;

														tokenData.points.push(tokenDataSubs);
														// tokenData.points.push( JSON.parse(JSON.stringify(tokenDataSubs)) );
												}

												break;
										case 2:
												for (let c2 = 0; c2 < tokens[i].surface_form.length; c2++) {
														notations.push([tokens[i].surface_form[c2], 2, MyUtil.toRawHiragana(tokens[i].reading[c2]), (tokens[i].pronunciation && tokens[i].pronunciation[c2]) || tokens[i].reading[c2]]);

														var tokenDataSubs = {};
														tokenDataSubs.surfaceForm = tokens[i].surface_form[c2];
														tokenDataSubs.miscNum = 2;
														tokenDataSubs.hiragana = MyUtil.toRawHiragana(tokens[i].reading[c2]);
														tokenDataSubs.katakana = (tokens[i].pronunciation && tokens[i].pronunciation[c2]) || tokens[i].reading[c2];
													tokenDataSubs.isKanji = false;

														tokenData.points.push(tokenDataSubs);
												}

												break;
										case 3:
												for (let c3 = 0; c3 < tokens[i].surface_form.length; c3++) {
														notations.push([tokens[i].surface_form[c3], 3, tokens[i].surface_form[c3], tokens[i].surface_form[c3]]);

														var tokenDataSubs = {};
														tokenDataSubs.surfaceForm = tokens[i].surface_form[c3];
														tokenDataSubs.miscNum = 3;
														tokenDataSubs.hiragana = tokens[i].surface_form[c3];
														tokenDataSubs.katakana = tokens[i].surface_form[c3];
														tokenDataSubs.isKanji = false;

														tokenData.points.push(tokenDataSubs);
												}

												break;
										default:
												throw new Error("Unknown strType");
								}

								// tokensData.push(JSON.parse(JSON.stringify(tokenData))); //~
								// tokensData.push(JSON.stringify(tokenData));
								myTokens.tokens.push(tokenData);

						}

						// console.log('notations', notations);
						// console.log('myTokens', myTokens);
						// // console.log('tokensData', JSON.stringify(tokensData, null, '\t'));
						// console.log('myTokens: %j', myTokens);
						// console.log('myTokens u:', nodesJsUtil.inspect(myTokens,false,null));

						let result = "";
						switch (options.to) {
								case "katakana":
										if (options.mode === "okurigana") {
												for (let n0 = 0; n0 < notations.length; n0++) {
														if (notations[n0][1] !== 1) {
																result += notations[n0][0];
														}
														else {
																result += notations[n0][0] + options.delimiter_start + MyUtil.toRawKatakana(notations[n0][2]) + options.delimiter_end;
														}
												}
										}
										else { // furigana
												for (let n1 = 0; n1 < notations.length; n1++) {
														if (notations[n1][1] !== 1) {
																result += notations[n1][0];
														}
														else {
																result += `<ruby>${notations[n1][0]}<rp>${options.delimiter_start}</rp><rt>${MyUtil.toRawKatakana(notations[n1][2])}</rt><rp>${options.delimiter_end}</rp></ruby>`;
														}
												}
										}
										return result;
								case "romaji":
										if (options.mode === "okurigana") {
												for (let n2 = 0; n2 < notations.length; n2++) {
														if (notations[n2][1] !== 1) {
																result += notations[n2][0];
														}
														else {
																result += notations[n2][0] + options.delimiter_start + MyUtil.toRawRomaji(notations[n2][3], options.romajiSystem) + options.delimiter_end;
														}
												}
										}
										else { // furigana
												result += "<ruby>";
												for (let n3 = 0; n3 < notations.length; n3++) {
														result += `${notations[n3][0]}<rp>${options.delimiter_start}</rp><rt>${MyUtil.toRawRomaji(notations[n3][3], options.romajiSystem)}</rt><rp>${options.delimiter_end}</rp>`;
												}
												result += "</ruby>";
										}
										return result;
								case "hiragana":
										if (options.mode === "okurigana") {
												for (let n4 = 0; n4 < notations.length; n4++) {
														if (notations[n4][1] !== 1) {
																result += notations[n4][0];
														}
														else {
																result += notations[n4][0] + options.delimiter_start + notations[n4][2] + options.delimiter_end;
														}
												}
										}
										else { // furigana

												// result += nodesJsUtil.inspect(tokensData,false,null);
												// return nodesJsUtil.inspect(myTokens,false,null); // Returns SOMETHING.
												// return JSON.parse( nodesJsUtil.inspect(tokensData,false,null) ); // Unable to process this
												// return tokensData; // Still doesn't return anything.
												// return JSON.stringify(tokensData); // Returns Nothing.
												return myTokens;

												// result += tokensData; //JSON.stringify(tokensData);
												// result += "\n\n";
												// for (let m5 = 0; m5 < tokensData.length; m5++) {
												//   result += tokensData[m5].surfaceForm + ", ";
												// }

												// for (let n5 = 0; n5 < notations.length; n5++) {
												//     if (notations[n5][1] !== 1) {
												//         result += ['<div class="notation">',notations[n5][0],'</div>'].join('');
												//     }
												//     else {
												//         result += `<div class="notation"><ruby>${notations[n5][0]}<rp>${options.delimiter_start}</rp><rt>${notations[n5][2]}</rt><rp>${options.delimiter_end}</rp></ruby></div>`;
												//     }
												// }
										}
										return result;
								default:
										throw new Error("Invalid Target Syllabary.");
						}
				}
		}
}

// const Util = {
//     isHiragana,
//     isKatakana,
//     isKana,
//     isKanji,
//     isJapanese,
//     hasHiragana,
//     hasKatakana,
//     hasKana,
//     hasKanji,
//     hasJapanese,
//     kanaToHiragna,
//     kanaToKatakana,
//     kanaToRomaji
// };

//Kuroshiro.Util = Util;

// export default Kuroshiro;
