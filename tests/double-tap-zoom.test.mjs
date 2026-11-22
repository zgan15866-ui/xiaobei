import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("double-tap zoom is disabled and pinch zoom stays available", () => {
  assert.match(html, /touch-action:\s*manipulation/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html, /var STORAGE_KEY = "kidseng\.v1"/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale/i);
  assert.doesNotMatch(html, /requestFullscreen/);
  assert.doesNotMatch(html, /speech\.js/);
  assert.match(html, /\.look-card\{[^}]*touch-action:\s*pan-y/);
  assert.doesNotMatch(html, /touchend[\s\S]{0,120}preventDefault/);
});
