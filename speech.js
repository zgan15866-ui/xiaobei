/* 小贝学英语：只用设备自带的 Web Speech，不接付费语音，也不把合成音说成真人。
   tree / grape 以及所有词都按英语原文读，不用汉字谐音，也不改拼写去迎合某个听感。 */
(function (root) {
  "use strict";

  var WORD_RATE = 0.92;
  var PHRASE_RATE = 0.9;

  function normLang(l) {
    return String(l || "").replace(/_/g, "-").toLowerCase();
  }

  function isUS(lang) {
    var n = normLang(lang);
    return n === "en-us" || n.indexOf("en-us-") === 0;
  }

  function isEN(lang) {
    var n = normLang(lang);
    return n === "en" || n.indexOf("en-") === 0;
  }

  /* 花活嗓音会把短词读得很怪，排在正常英语声音后面。 */
  var NOVELTY = /bad news|bahh|bells|boing|bubbles|cellos|zarvox|trinoids|whisper|superstar|albert|fred\b|junior|ralph|kathy|pipe organ|good news|hysterical|deranged|princess/i;

  /* 越靠前越优先。这是设备上常见、相对清楚的美式嗓音名字，不是录音库。 */
  var US_RANK = [
    /samantha.*(enhanced|premium)/i,
    /ava.*(enhanced|premium)/i,
    /allison.*(enhanced|premium)/i,
    /zoe.*(enhanced|premium)/i,
    /nicky.*(enhanced|premium)/i,
    /aria/i,
    /jenny/i,
    /samantha/i,
    /ava\b/i,
    /allison/i,
    /nicky/i,
    /zoe\b/i,
    /susan/i,
    /google\s*us\s*english/i,
    /alex\b/i,
    /tom\b/i
  ];

  function voiceScore(v) {
    if (!v) return -1;
    var name = String(v.name || "");
    if (!isEN(v.lang)) return -1;
    var score = isUS(v.lang) ? 200 : 40;
    if (NOVELTY.test(name)) score -= 200;
    for (var i = 0; i < US_RANK.length; i++) {
      if (US_RANK[i].test(name)) {
        score += (US_RANK.length - i) * 5;
        break;
      }
    }
    if (/enhanced|premium|natural|neural/i.test(name)) score += 20;
    if (v.localService === true) score += 4;
    return score;
  }

  function pickVoice(list) {
    var best = null;
    var bestScore = -1;
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var s = voiceScore(arr[i]);
      if (s > bestScore) {
        bestScore = s;
        best = arr[i];
      }
    }
    return best;
  }

  function bcp47For(voice) {
    if (!voice) return "en-US";
    var n = normLang(voice.lang);
    if (isUS(n)) return "en-US";
    if (n.indexOf("en-gb") === 0) return "en-GB";
    if (n.indexOf("en-au") === 0) return "en-AU";
    if (n === "en") return "en-US";
    return String(voice.lang || "en-US").replace(/_/g, "-");
  }

  /* spoken 是希望孩子听到的英语原文。前后空格只用来减轻短词开头/结尾被切掉，本身不读成字。 */
  function buildUtterance(text, kind) {
    var spoken = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    return {
      spoken: spoken,
      utteranceText: spoken ? (" " + spoken + " ") : "",
      rate: kind === "phrase" ? PHRASE_RATE : WORD_RATE,
      pitch: 1
    };
  }

  /* 看图字母卡上同时有字母和例词，要两个都读到。听字母游戏不要用这个。 */
  function letterLine(letter, exampleEn) {
    var L = String(letter || "").trim();
    var ex = String(exampleEn || "").replace(/\s+/g, " ").trim();
    if (L && ex) return L + ", " + ex;
    return L || ex;
  }

  function createController(opts) {
    opts = opts || {};
    var seq = 0;
    var timer = null;
    var unlocked = false;
    var warnedFallback = false;
    var last = emptyLast();
    var log = [];
    var stateCb = opts.onState || function () {};
    var toast = opts.toast || function () {};
    var delayMs = opts.cancelDelayMs == null ? 90 : opts.cancelDelayMs;
    var uiTimer = null;

    function emptyLast() {
      return {
        spoken: "",
        utteranceText: "",
        lang: "",
        voiceName: "",
        voiceURI: "",
        fallback: false,
        hadVoice: false,
        us: false,
        rate: WORD_RATE,
        kind: "word",
        error: ""
      };
    }

    function getSynth() {
      try { return opts.getSynth ? opts.getSynth() : null; }
      catch (e) { return null; }
    }

    function getVoices() {
      try {
        if (opts.getVoices) return opts.getVoices() || [];
        var synth = getSynth();
        return (synth && synth.getVoices && synth.getVoices()) || [];
      } catch (e) {
        return [];
      }
    }

    function remember(extra) {
      last = emptyLast();
      var k;
      for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) last[k] = extra[k];
      log.push({
        spoken: last.spoken,
        utteranceText: last.utteranceText,
        lang: last.lang,
        voiceName: last.voiceName,
        voiceURI: last.voiceURI,
        fallback: last.fallback,
        hadVoice: last.hadVoice,
        us: last.us,
        rate: last.rate,
        kind: last.kind,
        error: last.error
      });
      return last;
    }

    function failToast() {
      toast("这次没播出来，再点一次。如果还是没有，看看是不是静音了");
    }

    function clearUiLater(my) {
      if (uiTimer) clearTimeout(uiTimer);
      uiTimer = setTimeout(function () {
        if (my === seq) stateCb(false);
      }, opts.uiHoldMs == null ? 4000 : opts.uiHoldMs);
    }

    function speak(text, kind) {
      var built = buildUtterance(text, kind || "word");
      var synth = getSynth();
      if (!synth || typeof synth.speak !== "function" || !built.spoken) {
        remember({ spoken: built.spoken, kind: kind || "word", error: "unavailable" });
        toast("这次没有声音，再点一下试试");
        stateCb(false);
        return { ok: false, spoken: built.spoken };
      }
      var my = ++seq;
      var hadTimer = !!timer;
      if (timer) { clearTimeout(timer); timer = null; }
      var busy = false;
      try { busy = !!(synth.speaking || synth.pending); } catch (e) { busy = false; }
      var delay = 0;
      if (unlocked && (busy || hadTimer)) {
        try { synth.cancel(); } catch (e) {}
        delay = delayMs;
      }
      function fire() {
        if (my !== seq) return;
        timer = null;
        try {
          var Utter = opts.Utterance || root.SpeechSynthesisUtterance;
          if (!Utter) throw new Error("no-utterance");
          var u = new Utter(built.utteranceText);
          var voice = pickVoice(getVoices());
          if (voice) {
            try { u.voice = voice; } catch (e) {}
            u.lang = bcp47For(voice);
          } else {
            u.lang = "en-US";
          }
          u.rate = built.rate;
          u.pitch = built.pitch;
          u.volume = 1;
          var us = !!(voice && isUS(voice.lang));
          remember({
            spoken: built.spoken,
            utteranceText: u.text,
            lang: u.lang,
            voiceName: voice ? (voice.name || "") : "",
            voiceURI: voice ? (voice.voiceURI || "") : "",
            fallback: !us,
            hadVoice: !!voice,
            us: us,
            rate: built.rate,
            kind: kind || "word",
            error: ""
          });
          u.onerror = function (ev) {
            if (my !== seq) return;
            var err = (ev && ev.error) || "";
            if (err === "interrupted" || err === "canceled" || err === "cancelled") return;
            last.error = err || "error";
            failToast();
            stateCb(false);
          };
          u.onend = function () {
            if (my !== seq) return;
            if (uiTimer) clearTimeout(uiTimer);
            stateCb(false);
          };
          stateCb(true);
          clearUiLater(my);
          synth.speak(u);
          unlocked = true;
          try { if (synth.paused && synth.resume) synth.resume(); } catch (e) {}
          if (voice && !us && !warnedFallback) {
            warnedFallback = true;
            toast("这台设备没有美式声音，先用现在的英语声音");
          }
        } catch (e) {
          remember({ spoken: built.spoken, kind: kind || "word", error: "throw" });
          failToast();
          stateCb(false);
        }
      }
      if (delay) timer = setTimeout(fire, delay);
      else fire();
      return { ok: true, spoken: built.spoken, seq: my, delay: delay };
    }

    return {
      speak: speak,
      pickVoice: function () { return pickVoice(getVoices()); },
      last: function () { return last; },
      log: function () { return log.slice(); },
      _seq: function () { return seq; }
    };
  }

  var api = {
    WORD_RATE: WORD_RATE,
    PHRASE_RATE: PHRASE_RATE,
    normLang: normLang,
    isUS: isUS,
    voiceScore: voiceScore,
    pickVoice: pickVoice,
    buildUtterance: buildUtterance,
    letterLine: letterLine,
    bcp47For: bcp47For,
    createController: createController
  };
  root.KidsEngSpeech = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
