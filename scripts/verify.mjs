// Integration acceptance check against a running, built local studio.
import assert from "node:assert/strict";
import { mkdir, copyFile, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { openBrowser } from "../server/worker.mjs";
import { defaults, presets } from "../src/config.mjs";
import { soundtrack, sampleRate } from "../src/foley.mjs";
const origin = `http://127.0.0.1:${process.env.PORT ?? 4173}`,
  out = process.env.STUDIO_VERIFY_OUT ?? "samples";
await mkdir(out, { recursive: true });
await mkdir("outputs", { recursive: true });
const browser = await openBrowser();
const post = async (path, body) => {
  const r = await fetch(origin + "/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok);
  return r.json();
};
const jobs = async () => (await fetch(origin + "/api/jobs")).json();
async function wait(fn) {
  const end = Date.now() + 900000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(250);
  }
  throw Error("Verification timed out.");
}
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForSelector("#loading[hidden]", { state: "attached" });
  const seek = async (t) =>
    page.locator("#scrub").evaluate((e, t) => {
      e.value = String(t);
      e.dispatchEvent(new Event("input"));
      return document.querySelector("canvas").toDataURL();
    }, t);
  const captured = await seek(6.13);
  await seek(8.7);
  assert.equal(await seek(6.13), captured);
  await page.click('[data-letter="5"]');
  assert.notEqual(await seek(6.13), captured);
  await page.click("#restart");
  await page.waitForFunction(
    () => Number(document.querySelector("#scrub").value) > 0.15,
  );
  await page.click("#play");
  assert.equal(
    await page.locator("#play").getAttribute("aria-label"),
    "Play performance",
  );
  for (const n of [
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
  ]) {
    await page.fill("#name", n);
    for (const a of ["landscape", "square", "portrait"]) {
      await page.click(`[data-format="${a}"]`);
      const clippedAt = await page.evaluate(() => {
        const source = document.querySelector("canvas"),
          s = document.querySelector("#scrub"),
          c = document.createElement("canvas");
        c.width = 320;
        c.height = Math.round((320 * source.height) / source.width);
        const ctx = c.getContext("2d", { willReadFrequently: true });
        const matte =
          c.width / c.height > 1.65 ? Math.ceil(0.127 * c.height) + 2 : 0;
        for (const t of [1.02, 4.12, 5.8, 6.14, 7.95, 8.48, 11.5]) {
          s.value = String(t);
          s.dispatchEvent(new Event("input"));
          ctx.drawImage(source, 0, 0, c.width, c.height);
          const { data } = ctx.getImageData(0, 0, c.width, c.height);
          for (let y = matte; y < c.height - matte; y++)
            for (let x = 0; x < c.width; x++) {
              const p = (y * c.width + x) * 4;
              if (
                (x < 2 ||
                  x >= c.width - 2 ||
                  y < matte + 2 ||
                  y >= c.height - matte - 2) &&
                Math.max(data[p], data[p + 1], data[p + 2]) < 90
              )
                return t;
            }
        }
        return null;
      });
      assert.equal(
        clippedAt,
        null,
        `${n}: foreground intersects ${a} image border at ${clippedAt}s`,
      );
      const b = await page.locator("canvas").boundingBox(),
        [w, h] = presets[a];
      assert.ok(
        Math.abs(b.width / b.height - w / h) < 0.01,
        `${n}: wrong ${a} preview proportions`,
      );
    }
  }
  for (const n of ["", "   ", "A".repeat(25), "李"]) {
    await page.fill("#name", n);
    await page.locator("#name").blur();
    assert.equal(
      await page.locator("#name").getAttribute("aria-invalid"),
      "true",
    );
    assert.ok(await page.locator("#error").textContent());
  }
  await page.click("#reset");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  await page.click('[data-letter="1"]');
  await page.locator("#play").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => Number(document.querySelector("#scrub").value) > 0.1,
  );
  await page.click("#play");
  await page.click("#batchLink");
  await page.fill("#batch", "I\n\n李\nI");
  await page.click("#enqueue");
  await page.waitForFunction(() =>
    document.querySelector("#batchMsg").textContent.includes("Line 3"),
  );
  assert.equal(await page.inputValue("#batch"), "李");
  const pair = (await jobs()).slice(-2);
  await post(`jobs/${pair[1].id}/cancel`, {});
  await wait(async () =>
    (await jobs()).find((j) => j.id === pair[0].id && j.frames > 0),
  );
  await post(`jobs/${pair[0].id}/cancel`, {});
  await wait(async () =>
    (await jobs())
      .filter((j) => pair.some((k) => k.id === j.id))
      .every((j) => j.status === "canceled"),
  );
  await post(`jobs/${pair[0].id}/retry`, {});
  await page.click("#back");
  await page.click("#reset");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.click("#export");
  await page.waitForSelector("#queue:not([hidden])");
  const single = (await jobs()).at(-1);
  const { ids, errors: bad } = await post("jobs", {
    entries: [
      { name: "Zoë", aspect: "square", lamp: "#c2bba7", ending: "restore" },
      { name: "José", aspect: "portrait" },
      { name: "SAMUEL" },
    ],
  });
  assert.deepEqual(bad, []);
  const allIds = [single.id, ...ids, pair[0].id];
  const completed = await wait(async () => {
    const selected = (await jobs()).filter((j) => allIds.includes(j.id));
    for (const j of selected) assert.notEqual(j.status, "failed", j.error);
    return selected.every((j) => j.status === "complete") && selected;
  });
  assert.equal(new Set(completed.map((j) => j.file)).size, 5);
  assert.equal(completed.find((j) => j.id === ids[0]).config.target, 1);
  const manifest = [];
  for (const id of [single.id, ids[0], ids[1]]) {
    const j = completed.find((j) => j.id === id),
      file = `${out}/${j.config.aspect}.mp4`;
    await copyFile(`outputs/${j.file}`, file);
    const info = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ]),
    );
    const v = info.streams[0];
    assert.deepEqual(
      [
        v.codec_name,
        v.pix_fmt,
        v.width,
        v.height,
        v.r_frame_rate,
        +v.nb_read_frames,
        +v.duration,
      ],
      [
        "h264",
        "yuv420p",
        ...presets[j.config.aspect],
        "30/1",
        defaults.fps * defaults.duration,
        defaults.duration,
      ],
    );
    const audio = info.streams.find((s) => s.codec_type === "audio");
    assert.deepEqual(
      [audio.codec_name, audio.channels, +audio.sample_rate],
      ["aac", 2, sampleRate],
    );
    const pcm = execFileSync(
        "ffmpeg",
        [
          "-loglevel",
          "error",
          "-i",
          file,
          "-map",
          "0:a:0",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { maxBuffer: 8e6 },
      ),
      [master] = soundtrack(j.config);
    let ab = 0,
      aa = 0,
      bb = 0;
    for (let i = 400000; i < 402400; i++) {
      const a = master[i],
        b = pcm.readFloatLE(i * 8);
      ab += a * b;
      aa += a * a;
      bb += b * b;
    }
    assert.ok(
      ab / Math.sqrt(aa * bb) > 0.94,
      "Final impact audio not aligned to master",
    );
    const dl = await fetch(origin + "/api/download/" + id);
    assert.equal(Number(dl.headers.get("content-length")), +info.format.size);
    await dl.body.cancel();
    manifest.push({
      file,
      config: j.config,
      bytes: +info.format.size,
      frames: +v.nb_read_frames,
    });
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "select='eq(n,40)+eq(n,81)+eq(n,155)+eq(n,182)+eq(n,240)+eq(n,345)',scale=" +
        (j.config.aspect === "portrait" ? "180:-2" : "420:-2") +
        ",tile=3x2",
      "-frames:v",
      "1",
      `${out}/${j.config.aspect}-poses.jpg`,
    ]);
  }
  await writeFile(
    `${out}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  // Compare a decoded impact frame against an independent editor reconstruction.
  await page.click("#back");
  await page.click("#reset");
  const preview = await seek(182 / 30);
  const decoded =
    "data:image/png;base64," +
    execFileSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-i",
        `${out}/landscape.mp4`,
        "-vf",
        "select='eq(n,182)'",
        "-frames:v",
        "1",
        "-c:v",
        "png",
        "-f",
        "image2pipe",
        "pipe:1",
      ],
      { maxBuffer: 10e6 },
    ).toString("base64");
  const diff = await page.evaluate(
    async (urls) => {
      const data = [];
      for (const url of urls) {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 180;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 320, 180);
        data.push(ctx.getImageData(0, 0, 320, 180).data);
      }
      let sum = 0;
      data[0].forEach((v, i) => {
        if (i % 4 !== 3) sum += Math.abs(v - data[1][i]);
      });
      return sum / (320 * 180 * 3);
    },
    [preview, decoded],
  );
  assert.ok(diff < 4, `Preview/MP4 mean pixel error ${diff}`);
  await seek(4.25);
  await page.screenshot({ path: "outputs/editor-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "outputs/editor-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.ok(!(await readdir("outputs")).some((f) => f.startsWith(".frames-")));
  console.log(
    "Verified editor, all presets/names, seeks, mixed batch, cancellation, retry, 3 decoded films. Preview/MP4 mean channel difference:",
    diff,
  );
} finally {
  await browser.close();
}
