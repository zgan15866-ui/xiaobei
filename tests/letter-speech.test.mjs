import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const NAMES = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "jee", H: "aitch",
  I: "eye", J: "jay", K: "kay", L: "ell", M: "em", N: "en", O: "oh", P: "pee",
  Q: "cue", R: "ar", S: "ess", T: "tee", U: "you", V: "vee", W: "double you",
  X: "ex", Y: "why", Z: "zee"
};

test("all 26 letter names are American names and are not Capital glyphs", () => {
  assert.equal(Object.keys(NAMES).length, 26);
  for (const key of Object.keys(NAMES)) {
    const name = NAMES[key];
    assert.equal(/capital|[\u4e00-\u9fff]/i.test(name), false);
    assert.match(html, new RegExp(key + ':"' + name + '"'));
  }
  assert.match(html, /\["W","water"\]/);
  assert.match(html, /\["Z","zebra"\]/);
  assert.match(html, /听字母名/);
  assert.match(html, /id="lookWord">听单词/);
});

test("word text and stored progress stay unchanged", () => {
  assert.match(html, /\["things","bag","书包"/);
  assert.match(html, /\["things","tree","树"/);
  assert.match(html, /\["food","grape","葡萄"/);
  assert.match(html, /var STORAGE_KEY = "kidseng\.v1"/);
  assert.match(html, /else speak\(w\.en\)/);
  assert.doesNotMatch(html, /var lang="en-gb"/);
  assert.match(html, /else u\.lang="en-US"/);
  assert.match(html, /touch-action:\s*manipulation/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
});
