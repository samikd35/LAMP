import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setImmediate as tick } from "node:timers/promises";
import { promisify } from "node:util";
import { analyze, logoRasterLimit, logoSvgLimit, snapshot } from "../src/config.mjs";
import { evaluate, strikes } from "../src/timeline.mjs";
import { soundtrack, sampleRate } from "../src/foley.mjs";
import { queue } from "../server/queue.mjs";

test("startup reuses a running studio and reports other port conflicts", async (t) => {
  let serveJobs = true;
  const listener = createServer((req, res) => {
    if (req.url === "/api/jobs" && serveJobs) {
      res.setHeader("Content-Type", "application/json");
      res.end("[]");
    } else {
      res.end("<title>Lamp Name Studio</title>");
    }
  }).listen(0, "127.0.0.1");
  t.after(() => listener.close());
  await once(listener, "listening");
  const { port } = listener.address();
  const start = promisify(execFile);
  const launch = (...args) => start(process.execPath, ["server/studio.mjs", ...args], {
    env: { ...process.env, PORT: String(port) },
    timeout: 5000,
  });
  assert.ok((await launch("--reuse")).stdout.includes(`already running at http://127.0.0.1:${port}`));
  await assert.rejects(launch(), { code: 1, stderr: /already in use.*PORT/s });
  serveJobs = false;
  await assert.rejects(launch("--reuse"), { code: 1, stderr: /already in use.*PORT/s });
});

test("real glyph coverage, grapheme limits and punctuation", () => {
  for (const n of [
    "SAMUEL",
    "I",
    "A",
    "WWW",
    "ILLI",
    "Zoë",
    "José",
    "Anne-Marie",
    "O'Connor",
    "O’Connor",
    "Mary Jane",
    "W".repeat(24),
  ])
    assert.equal(analyze(` ${n} `).name, n);
  assert.equal(analyze("Jose\u0301").chars.at(-1), "é");
  for (const n of [
    "",
    "   ",
    "A".repeat(25),
    "🎬",
    "张",
    "123",
    " -’ ",
    "a\u036f",
  ])
    assert.throws(() => analyze(n));
});
test("auto and explicit targets refer to actual grapheme indices", () => {
  assert.equal(snapshot({ name: "SAMUEL" }).target, 2);
  assert.equal(snapshot({ name: "PIXAR" }).target, 1);
  assert.equal(snapshot({ name: "A - B" }).target, 0);
  assert.equal(snapshot({ name: "A - B", target: 4 }).target, 4);
  assert.throws(() => snapshot({ name: "A - B", target: 2 }));
});
test("job snapshots preserve bounded vector or raster logo assets", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"/>';
  assert.deepEqual(snapshot({ name: "Badge.svg", logo: { svg }, target: 1 }).logo, { svg });
  assert.throws(() => snapshot({ name: "Badge.svg", logo: { svg: "x".repeat(logoSvgLimit + 1) } }), /SVG logo/);
  const logo = { w: logoRasterLimit, h: 32, rgba: Buffer.alloc(logoRasterLimit * 32 * 4).toString("base64") };
  assert.deepEqual(snapshot({ name: "Badge.png", logo }).logo, logo);
  assert.throws(() => snapshot({ name: "Badge.png", logo: { ...logo, w: logoRasterLimit + 1 } }), /logo pixels/);
});
test("queued Logo films have 498 frames and queued Name films have 390", () => {
  const q = queue(async () => {});
  const logo = { svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>' };
  const logoJob = q.add({ name: "Badge.svg", logo, duration: 13, frameCount: 390 });
  const nameJob = q.add({ name: "SAMUEL", duration: 16.6, frameCount: 498 });
  const timing = ({ config: { duration, fps, frameCount } }) => [duration, fps, frameCount];
  assert.deepEqual(timing(logoJob), [16.6, 30, 498]);
  assert.deepEqual(timing(nameJob), [13, 30, 390]);
});
test("out of order evaluation reconstructs the pose and baseline contact", () => {
  const s = {
    start: -4,
    approach: -3,
    target: 1,
    height: 1.3,
    baseline: 0.22,
    end: 4,
  };
  const times = [0, 2.9, 3.57, 147 / 24, 6.3, 7.7, 12.8];
  const poses = times.map((t) => evaluate(t, 13, s));
  for (const i of [5, 2, 6, 0, 3, 1, 4])
    assert.deepEqual(evaluate(times[i], 13, s), poses[i]);
  const impact = poses[3];
  assert.equal(impact.y, (s.height - s.baseline) * impact.squash + s.baseline);
  assert.equal(impact.x, s.target);
  assert.ok(poses.at(-1).squash < 0.002);
  assert.equal(poses.at(-1).x, s.target);
  const restored = evaluate(12, 13, s, "restore");
  assert.equal(restored.squash, 1);
  assert.equal(restored.y, 0);
  assert.equal(restored.x, s.end);
});
test("foley onsets share the strike clock, with a stronger final impact", () => {
  const cfg = snapshot({ name: "PIXAR" }),
    [l, r] = soundtrack(cfg);
  assert.equal(l.length, sampleRate * cfg.duration);
  assert.deepEqual(r, soundtrack(cfg)[1]);
  const peaks = strikes.map((f) =>
    l
      .subarray(f * 2000, f * 2000 + 1440)
      .reduce((a, b) => Math.max(a, Math.abs(b)), 0),
  );
  assert.ok(peaks.every((p) => p > 0.08));
  assert.ok(peaks.at(-1) > 1.8 * peaks[0]);
});
test("Logo foley follows the delayed entrance and ceiling contact", async () => {
  const cfg = snapshot({ name: "Badge.svg", logo: { svg: "<svg/>" } });
  const clatter = await readFile(new URL("../src/assets/ceiling-clatter.wav", import.meta.url));
  const [left, right] = soundtrack(cfg, clatter);
  const peak = (from, length) => left
    .subarray(Math.round(from * sampleRate), Math.round((from + length) * sampleRate))
    .reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
  assert.equal(left.length, 796800);
  const firstFootfall = 3.3 + 22 / 24;
  assert.equal(peak(0, firstFootfall), 0);
  assert.ok(peak(firstFootfall, 0.03) > 0.012);
  assert.ok(peak(379 / 30, 0.075) > peak(379 / 30 - 0.075, 0.075) * 2);
  assert.notDeepEqual(left, right);
});
test("queue isolation, cancellation, failure, continuation and retry", async () => {
  let resolve,
    fail = true;
  const q = queue(async (j, signal) => {
    if (j.config.name === "A" && fail) {
      fail = false;
      throw Error("encoder unavailable");
    }
    if (j.config.name === "B")
      await new Promise((r, reject) => {
        resolve = r;
        signal.addEventListener("abort", () => reject(Error("aborted")));
      });
  });
  const input = { name: "A" },
    a = q.add(input);
  input.name = "B";
  const b = q.add(input),
    c = q.add(input),
    d = q.add({ name: "Zoë" });
  q.cancel(c);
  await tick();
  assert.equal(a.status, "failed");
  assert.equal(a.config.name, "A");
  assert.equal(b.status, "rendering");
  q.cancel(b);
  await tick();
  assert.equal(b.status, "canceled");
  assert.equal(c.status, "canceled");
  assert.equal(d.status, "complete");
  assert.notEqual(b.file, c.file);
  q.retry(a);
  q.retry(c);
  await tick();
  resolve();
  await tick();
  assert.equal(a.status, "complete");
  assert.equal(c.status, "complete");
  assert.equal(d.frames, 0);
});
