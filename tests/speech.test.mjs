import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const speech = require("../speech.js");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const IOS = [
  { name: "Tingting", lang: "zh-CN", localService: true, voiceURI: "ting" },
  { name: "Daniel", lang: "en-GB", localService: true, voiceURI: "daniel" },
  { name: "Arthur", lang: "en-GB", localService: true, voiceURI: "arthur" },
  { name: "Kate", lang: "en-GB", localService: true, voiceURI: "kate" },
  { name: "Moira", lang: "en-IE", localService: true, voiceURI: "moira" },
  { name: "Fred", lang: "en-US", localService: true, voiceURI: "fred" },
  { name: "Alex", lang: "en-US", localService: true, voiceURI: "alex" },
  { name: "Samantha", lang: "en-US", localService: true, voiceURI: "samantha" },
  { name: "Samantha (Enhanced)", lang: "en-US", localService: true, voiceURI: "samantha-e" }
];

function trimSpoken(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function fakeSynth(voices) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    cancelCount: 0,
    getVoices() { return voices; },
    cancel() {
      this.cancelCount++;
      this.speaking = false;
      this.pending = false;
      active = 0;
    },
    speak(u) {
      active++;
      maxActive = Math.max(maxActive, active);
      this.speaking = true;
      calls.push(u);
    },
    resume() {}
  };
  function Utterance(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onerror = null;
    this.onend = null;
  }
  return { synth, calls, Utterance, maxActive: () => maxActive };
}

function controller(voices, toasts, delay) {
  const fake = fakeSynth(voices);
  const ctl = speech.createController({
    getSynth: () => fake.synth,
    getVoices: () => voices,
    Utterance: fake.Utterance,
    toast: (m) => toasts.push(m),
    onState() {},
    cancelDelayMs: delay == null ? 30 : delay,
    uiHoldMs: 5000
  });
  return { ctl, ...fake, toasts };
}

test("tree and grape stay the english words, with no homophone rewrite", () => {
  for (const word of ["tree", "grape"]) {
    const built = speech.buildUtterance(word, "word");
    assert.equal(built.spoken, word);
    assert.equal(trimSpoken(built.utteranceText), word);
    assert.equal(built.utteranceText.includes(word), true);
    assert.equal(/[吹树葡萄]|chree|grayp/i.test(built.spoken + built.utteranceText), false);
    assert.ok(built.rate >= 0.85 && built.rate <= 1);
  }
  assert.equal(speech.letterLine("T", "tree"), "T, tree");
  assert.equal(speech.letterLine("G", "grape"), "G, grape");
  assert.equal(/[\u4e00-\u9fff]/.test(speech.letterLine("T", "tree")), false);
});

test("prefers a clear en-US voice over Daniel, Arthur, Kate and novelty Fred", () => {
  const picked = speech.pickVoice(IOS);
  assert.equal(picked.name, "Samantha (Enhanced)");
  assert.equal(speech.bcp47For(picked), "en-US");
  assert.equal(speech.isUS(picked.lang), true);
});

test("word cards send the full word tree and grape to the US voice", () => {
  const toasts = [];
  const { ctl, calls } = controller(IOS, toasts);
  ctl.speak("tree");
  ctl.speak("grape");
  assert.equal(calls.length, 1);
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(calls.length, 2);
      assert.equal(trimSpoken(calls[0].text), "tree");
      assert.equal(trimSpoken(calls[1].text), "grape");
      assert.equal(calls[1].lang, "en-US");
      assert.equal(calls[1].voice.name, "Samantha (Enhanced)");
      assert.equal(calls[1].text.includes("grape"), true);
      assert.equal(calls[1].text.includes("葡萄"), false);
      assert.equal(ctl.last().spoken, "grape");
      assert.equal(ctl.last().us, true);
      assert.deepEqual(toasts, []);
      resolve();
    }, 50);
  });
});

test("rapid taps do not overlap and do not truncate tree", async () => {
  const toasts = [];
  const box = controller(IOS, toasts, 40);
  box.ctl.speak("cat");
  box.ctl.speak("tree");
  box.ctl.speak("grape");
  box.ctl.speak("tree");
  assert.equal(box.calls.length, 1);
  assert.equal(trimSpoken(box.calls[0].text), "cat");
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(box.calls.length, 2);
  assert.equal(trimSpoken(box.calls[1].text), "tree");
  assert.equal(box.calls[1].text.includes("tre"), true);
  assert.notEqual(trimSpoken(box.calls[1].text), "tre");
  assert.equal(box.maxActive(), 1);
  assert.ok(box.synth.cancelCount >= 1);
  const interrupted = toasts.filter((m) => m.includes("没播出来"));
  assert.equal(interrupted.length, 0);
});

test("cancel/interrupted is not shown as a playback failure", async () => {
  const toasts = [];
  const box = controller(IOS, toasts, 40);
  box.ctl.speak("tree");
  const first = box.calls[0];
  box.ctl.speak("grape");
  first.onerror({ error: "interrupted" });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(toasts.some((m) => m.includes("没播出来")), false);
  assert.equal(trimSpoken(box.calls.at(-1).text), "grape");
});

test("a real speak error tells the child to tap again", () => {
  const toasts = [];
  const box = controller(IOS, toasts);
  box.ctl.speak("tree");
  box.calls[0].onerror({ error: "synthesis-failed" });
  assert.equal(toasts.some((m) => m.includes("再点一次")), true);
  assert.equal(box.ctl.last().spoken, "tree");
});

test("no english voice still requests en-US and keeps the word tree", () => {
  const toasts = [];
  const zh = [{ name: "Tingting", lang: "zh-CN", localService: true }];
  const box = controller(zh, toasts);
  const result = box.ctl.speak("tree");
  assert.equal(result.ok, true);
  assert.equal(trimSpoken(box.calls[0].text), "tree");
  assert.equal(box.calls[0].lang, "en-US");
  assert.equal(box.calls[0].voice, null);
  assert.equal(box.ctl.last().hadVoice, false);
  assert.equal(toasts.some((m) => /美式声音/.test(m)), false);
});

test("british-only device falls back without respelling grape", () => {
  const toasts = [];
  const gb = [
    { name: "Daniel", lang: "en-GB", localService: true, voiceURI: "daniel" },
    { name: "Kate", lang: "en-GB", localService: true, voiceURI: "kate" }
  ];
  const box = controller(gb, toasts);
  box.ctl.speak("grape");
  assert.equal(trimSpoken(box.calls[0].text), "grape");
  assert.equal(box.calls[0].lang, "en-GB");
  assert.equal(box.calls[0].voice.lang, "en-GB");
  assert.equal(box.ctl.last().fallback, true);
  assert.equal(toasts.some((m) => m.includes("没有美式声音")), true);
  box.ctl.speak("tree");
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(toasts.filter((m) => m.includes("没有美式声音")).length, 1);
      assert.equal(trimSpoken(box.calls.at(-1).text), "tree");
      resolve();
    }, 50);
  });
});

test("missing speech engine shows a clear toast", () => {
  const toasts = [];
  const ctl = speech.createController({
    getSynth: () => null,
    toast: (m) => toasts.push(m),
    onState() {}
  });
  const result = ctl.speak("tree");
  assert.equal(result.ok, false);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /没有声音/);
});

test("stored progress key, word ids, and cache split stay intact", () => {
  assert.match(indexHtml, /var STORAGE_KEY = "kidseng\.v1"/);
  assert.match(indexHtml, /\["things","tree","树","🌳"\]/);
  assert.match(indexHtml, /\["food","grape","葡萄","🍇"\]/);
  assert.match(indexHtml, /src="speech\.js"/);
  assert.doesNotMatch(indexHtml, /var lang="en-gb"/);
  assert.doesNotMatch(indexHtml, /Daniel\|Arthur\|Kate/);
  assert.match(indexHtml, /speakLook\(w\)/);
  assert.match(sw, /const CACHE = "kidseng-v2"/);
  assert.match(sw, /speech\.js/);
  assert.doesNotMatch(sw, /caches\.open\("kidseng\.v1"\)/);
});
