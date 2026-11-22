import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = require("/tmp/pt/node_modules/puppeteer-core");

const PORT = 8765;
const ROOT = "/workspace";
const OUT = "/tmp/xiaobei-shots";
mkdirSync(OUT, { recursive: true });

function startServer() {
  const child = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return child;
}

function trim(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

const preset = {
  name: "Lily",
  learned: {
    tree: { streak: 2, done: true, at: "2026-11-01" },
    grape: { streak: 1, done: false },
    cat: { streak: 2, done: true, at: "2026-11-01" }
  },
  stickers: [{ id: "s1", emoji: "🌸", date: "2026-11-01", src: "look" }],
  today: { date: "2026-11-01", words: ["tree"], stickerCount: 1 }
};

async function main() {
  const server = startServer();
  let browser;
  const requests = [];
  const report = { voices: [], tree: null, grape: null, letterT: null, letterG: null, listenT: null, rapid: null, flow: [], errors: [] };
  try {
    const readyAt = Date.now() + 8000;
    let up = false;
    while (Date.now() < readyAt) {
      try {
        const res = await fetch("http://127.0.0.1:" + PORT + "/index.html");
        if (res.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!up) throw new Error("server start timeout");

    browser = await puppeteer.launch({
      executablePath: "/usr/bin/google-chrome",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=420,900"
      ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on("pageerror", (err) => report.errors.push(String(err)));
    page.on("request", (req) => requests.push(req.url()));
    await page.evaluateOnNewDocument((saved) => {
      localStorage.setItem("kidseng.v1", JSON.stringify(saved));
      window.__speakCalls = [];
      const wrap = () => {
        if (!window.speechSynthesis || window.speechSynthesis.__wrapped) return;
        const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = function (u) {
          window.__speakCalls.push({
            text: u.text,
            lang: u.lang,
            rate: u.rate,
            voice: u.voice ? u.voice.name : "",
            voiceLang: u.voice ? u.voice.lang : ""
          });
          return speak(u);
        };
        window.speechSynthesis.__wrapped = true;
      };
      wrap();
    }, preset);

    await page.goto("http://127.0.0.1:" + PORT + "/index.html?nosw=1", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => window.__kidseng && document.querySelector("#v-home.on"));

    const kept = await page.evaluate(() => {
      const raw = localStorage.getItem("kidseng.v1");
      const store = window.__kidseng.getStore();
      return {
        key: window.__kidseng.STORAGE_KEY,
        raw,
        name: store.name,
        tree: store.learned.tree,
        grape: store.learned.grape,
        cat: store.learned.cat,
        sticker: store.stickers[0] && store.stickers[0].id,
        build: window.__kidseng.APP_BUILD
      };
    });
    if (kept.key !== "kidseng.v1") throw new Error("storage key changed");
    if (!kept.tree || kept.tree.done !== true) throw new Error("tree progress lost " + JSON.stringify(kept.tree));
    if (!kept.grape || kept.grape.streak !== 1 || kept.grape.done) throw new Error("grape progress changed " + JSON.stringify(kept.grape));
    if (!kept.cat || kept.cat.done !== true) throw new Error("cat progress lost");
    if (kept.sticker !== "s1") throw new Error("sticker lost");
    if (kept.name !== "Lily") throw new Error("name lost");
    report.flow.push("progress kept");

    report.voices = await page.evaluate(() => {
      const list = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      return list.map((v) => ({ name: v.name, lang: v.lang, localService: v.localService }));
    });

    async function playLook(theme, id) {
      await page.evaluate((theme, id) => window.__kidseng.startLook(theme, { prefer: [id] }), theme, id);
      await page.waitForSelector("#lookSay");
      const shown = await page.evaluate(() => ({
        id: window.__kidseng.debug().look,
        text: document.querySelector("#v-look").innerText
      }));
      await page.click("#lookSay");
      await page.click("#lookSay");
      await page.click("#lookSay");
      await new Promise((r) => setTimeout(r, 180));
      const spoken = await page.evaluate(() => {
        const log = window.__kidseng.speech.log();
        const calls = window.__speakCalls || [];
        return { log: log.slice(-4), calls: calls.slice(-4), last: window.__kidseng.speech.last() };
      });
      return { shown, spoken };
    }

    const tree = await playLook("things", "tree");
    report.tree = tree;
    await page.screenshot({ path: path.join(OUT, "look-tree-375.png") });
    if (tree.shown.id !== "tree") throw new Error("look did not open tree");
    if (!/tree/.test(tree.shown.text) || !/树/.test(tree.shown.text)) throw new Error("tree card text missing");
    if (trim(tree.spoken.last.spoken) !== "tree") throw new Error("tree spoken was " + JSON.stringify(tree.spoken.last));
    if (trim(tree.spoken.last.utteranceText) !== "tree") throw new Error("tree utterance truncated " + tree.spoken.last.utteranceText);
    const treeCalls = (tree.spoken.calls || []).map((c) => trim(c.text));
    if (!treeCalls.includes("tree")) throw new Error("speechSynthesis never received tree " + JSON.stringify(tree.spoken.calls));
    if (treeCalls.some((t) => t !== "tree" && t !== "")) throw new Error("unexpected utterance near tree " + JSON.stringify(treeCalls));

    const grape = await playLook("food", "grape");
    report.grape = grape;
    await page.screenshot({ path: path.join(OUT, "look-grape-375.png") });
    if (grape.shown.id !== "grape") throw new Error("look did not open grape");
    if (trim(grape.spoken.last.spoken) !== "grape") throw new Error("grape spoken was " + JSON.stringify(grape.spoken.last));
    if (!((grape.spoken.calls || []).map((c) => trim(c.text)).includes("grape"))) throw new Error("speechSynthesis never received grape");

    const letterT = await playLook("letters", "letter-t");
    report.letterT = letterT;
    await page.screenshot({ path: path.join(OUT, "look-letter-t-375.png") });
    if (trim(letterT.spoken.last.spoken) !== "T, tree") throw new Error("letter T spoken " + JSON.stringify(letterT.spoken.last));
    if (!/tree/.test(letterT.shown.text)) throw new Error("letter card hid tree");

    const letterG = await playLook("letters", "letter-g");
    report.letterG = letterG;
    if (trim(letterG.spoken.last.spoken) !== "G, grape") throw new Error("letter G spoken " + JSON.stringify(letterG.spoken.last));

    await page.evaluate(() => window.__kidseng.startListen({ prefer: ["letter-t"] }));
    await page.waitForSelector("#letSay");
    await page.click("#letSay");
    await new Promise((r) => setTimeout(r, 200));
    report.listenT = await page.evaluate(() => window.__kidseng.speech.last());
    if (trim(report.listenT.spoken) !== "T") throw new Error("listen mode should say the letter T, got " + report.listenT.spoken);

    await page.evaluate(() => window.__kidseng.startQuiz("food", { prefer: ["grape"] }));
    await page.waitForSelector(".opt");
    await page.screenshot({ path: path.join(OUT, "quiz-grape-375.png") });
    const quizId = await page.evaluate(() => window.__kidseng.debug().quiz);
    if (quizId !== "grape") throw new Error("quiz did not start on grape");
    const wrong = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".opt"));
      const target = buttons.find((b) => b.getAttribute("data-id") !== "grape");
      target.click();
      return target.getAttribute("data-id");
    });
    await new Promise((r) => setTimeout(r, 80));
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".opt"));
      buttons.find((b) => b.getAttribute("data-id") !== "grape").click();
    });
    await page.waitForFunction(() => {
      const toast = document.querySelector("#toast");
      return toast && toast.style.display === "block" && /发亮/.test(toast.textContent);
    });
    const hinted = await page.evaluate(() => !!document.querySelector('.opt[data-id="grape"].hinted'));
    if (!hinted) throw new Error("correct grape was not highlighted");
    await page.screenshot({ path: path.join(OUT, "quiz-grape-hint-375.png") });
    await page.evaluate(() => document.querySelector('.opt[data-id="grape"]').click());
    await page.waitForSelector("#celeOk");
    const cele = await page.evaluate(() => document.querySelector("#cele").innerText);
    if (!/答对啦/.test(cele) || !/grape/.test(cele)) throw new Error("celebration missing " + cele);
    await page.screenshot({ path: path.join(OUT, "quiz-correct-375.png") });
    const afterCorrect = await page.evaluate(() => window.__kidseng.speech.last().spoken);
    if (trim(afterCorrect) !== "grape") throw new Error("correct answer did not replay grape, got " + afterCorrect);
    await page.click("#celeOk");

    for (let i = 0; i < 8; i++) {
      const done = await page.evaluate(() => !!document.querySelector("#celeAlt"));
      if (done) break;
      await page.waitForSelector(".opt", { timeout: 4000 });
      await page.evaluate(() => {
        const id = window.__kidseng.debug().quiz;
        document.querySelector('.opt[data-id="' + id + '"]').click();
      });
      await page.waitForSelector("#celeOk", { timeout: 4000 });
      const alt = await page.$("#celeAlt");
      if (alt) break;
      await page.click("#celeOk");
    }
    await page.waitForSelector("#celeAlt");
    await page.screenshot({ path: path.join(OUT, "round-end-375.png") });
    await page.click("#celeAlt");
    await page.waitForSelector("#v-home.on");
    await page.screenshot({ path: path.join(OUT, "home-375.png") });
    report.flow.push("home-look-quiz-settle-home");

    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluate(() => window.__kidseng.startLook("things", { prefer: ["tree"] }));
    await page.waitForSelector("#lookSay");
    const layout = await page.evaluate(() => {
      const btn = document.querySelector("#lookSay");
      const r = btn.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: window.innerHeight, visible: r.top >= 0 && r.bottom <= window.innerHeight + 1 };
    });
    report.layout667 = layout;
    await page.screenshot({ path: path.join(OUT, "look-tree-375x667.png") });
    if (!layout.visible) throw new Error("speak button offscreen at 375x667 " + JSON.stringify(layout));

    const still = await page.evaluate(() => {
      const store = window.__kidseng.getStore();
      return {
        tree: store.learned.tree && store.learned.tree.done,
        cat: store.learned.cat && store.learned.cat.done,
        sticker: store.stickers.some((s) => s.id === "s1"),
        name: store.name,
        key: localStorage.getItem("kidseng.v1") ? "kidseng.v1" : ""
      };
    });
    if (!still.tree || !still.cat || !still.sticker || still.name !== "Lily" || still.key !== "kidseng.v1") {
      throw new Error("progress damaged after play " + JSON.stringify(still));
    }

    const external = requests.filter((u) => !u.startsWith("http://127.0.0.1:" + PORT + "/") && !u.startsWith("data:"));
    report.external = external;
    if (external.length) throw new Error("unexpected external requests " + external.join(","));
    if (report.errors.length) throw new Error("page errors " + report.errors.join("\n"));

    const homeOverflow = await page.evaluate(() => {
      document.querySelector("[data-go=look]")?.click?.();
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    await page.evaluate(() => window.__kidseng.goHome());
    await page.waitForSelector("#v-home.on");
    const homeScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    report.homeScroll = homeScroll;
    if (homeOverflow && homeScroll) throw new Error("horizontal overflow");

    console.log(JSON.stringify(report, null, 2));
    console.log("BROWSER_FLOW_OK");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
