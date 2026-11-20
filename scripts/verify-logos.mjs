import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { openBrowser } from "../server/worker.mjs";
const port = process.env.LOGO_TEST_PORT ?? "4181",
  origin = `http://127.0.0.1:${port}`,
  out = process.env.LOGO_TEST_OUT ?? "samples/logos";
await mkdir(out, { recursive: true });
const service = spawn(process.execPath, ["server/studio.mjs"], {
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
const ff = (...args) =>
  execFileSync("ffmpeg", ["-v", "error", ...args], { maxBuffer: 32e6 });
try {
  await new Promise((resolve, reject) => {
    service.stdout.once("data", resolve);
    service.once("exit", () =>
      reject(Error("Test service exited before startup")),
    );
  });
  browser = await openBrowser();
  const p = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(origin + "/studio.html");
  await p.waitForSelector("#loading[hidden]", { state: "attached" });
  const seek = async (t) =>
    p.locator("#scrub").evaluate((el, t) => {
      el.value = t;
      el.dispatchEvent(new Event("input"));
      return document.querySelector("canvas").toDataURL();
    }, t);
  const setColor = (id, v) =>
    p.locator(id).evaluate((e, v) => {
      e.value = v;
      e.dispatchEvent(new Event("change"));
    }, v);
  await p.fill("#name", "Zoë");
  await p.click('[data-letter="2"]');
  await setColor("#lamp", "#947aca");
  await p.click('[data-format="square"]');
  const before = await seek(6.12);
  await p.check('[value="logo"][name="mode"]');
  assert.ok(await p.locator("#export").isDisabled());
  assert.equal(await p.getAttribute("#scrub", "max"), "16.6");
  await p
    .locator("#upload")
    .setInputFiles({
      name: "invalid.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>Not outlined</text></svg>',
      ),
    });
  await p.waitForFunction(() =>
    document.querySelector("#logoMsg").textContent.includes("outlines"),
  );
  const uploads = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 192;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4e7cf";
    ctx.fillRect(0, 0, c.width, c.height);
    const encode = (type) => c.toDataURL(type, 0.92).split(",")[1];
    const blank = encode("image/png");
    ctx.fillStyle = "#034b42";
    ctx.fillRect(32, 24, 80, 80);
    ctx.fillStyle = "#f4e7cf";
    ctx.fillRect(48, 40, 48, 48);
    ctx.fillStyle = "#97351c";
    ctx.fillRect(128, 48, 32, 32);
    const png = encode("image/png"), jpeg = encode("image/jpeg");
    ctx.fillStyle = "#006e99";
    ctx.fillRect(0, 0, 16, c.height);
    const complex = encode("image/png");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#034b42";
    ctx.fillRect(30, 20, 65, 82);
    ctx.fillStyle = "#97351c";
    ctx.fillRect(90, 35, 55, 50);
    return { blank, png, jpeg, complex, overlap: encode("image/png") };
  });
  for (const [key, name, mimeType, message] of [
    ["png", "flat.png", "image/png", "Solid background removed"],
    ["jpeg", "flat.jpg", "image/jpeg", "Solid background removed"],
    ["blank", "blank.png", "image/png", "No visible logo found"],
    ["complex", "complex.png", "image/png", "Couldn't find a solid background"],
  ]) {
    await p.locator("#upload").setInputFiles({
      name,
      mimeType,
      buffer: Buffer.from(uploads[key], "base64"),
    });
    await p.waitForFunction(
      (text) => document.querySelector("#logoMsg").textContent.includes(text),
      name.startsWith("flat") ? `${name} · 2 selectable parts · ${message}` : message,
    );
    assert.equal(await p.locator("#export").isEnabled(), name.startsWith("flat"));
  }
  await p.locator("#upload").setInputFiles({
    name: "touching.png",
    mimeType: "image/png",
    buffer: Buffer.from(uploads.overlap, "base64"),
  });
  await p.waitForFunction(() =>
    document.querySelector("#logoMsg").textContent.includes("2 selectable parts"),
  );
  const coloredBounds = (image) => p.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    const bounds = [[Infinity, -1, -1], [Infinity, -1, -1]];
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = pixels.subarray(i, i + 3);
      const j = r === 3 && g === 75 && b === 66 ? 0 : r === 151 && g === 53 && b === 28 ? 1 : -1;
      if (j < 0) continue;
      const x = i / 4 % c.width, y = Math.floor(i / 4 / c.width);
      const box = bounds[j];
      box[0] = Math.min(box[0], x);
      box[1] = Math.max(box[1], x);
      box[2] = Math.max(box[2], y);
    }
    return { bounds, width: c.width, height: c.height };
  }, image);
  const assembled = await coloredBounds(await seek(0));
  const [firstPart, secondPart] = assembled.bounds;
  assert.ok(secondPart[0] - firstPart[1] < assembled.width * 0.02, "Opening should preserve the uploaded gap");
  assert.ok(Math.abs(firstPart[2] - secondPart[2]) > 4, "Opening should preserve the original vertical alignment");
  const layout = await coloredBounds(await seek(3.2));
  const [a, b] = layout.bounds;
  assert.ok(a[1] > a[0] && b[1] > b[0], "Both touching colors should render as separate faces");
  assert.ok(b[0] - a[1] > layout.width * 0.04, "Name-style gap should be visible");
  assert.ok(Math.abs(a[2] - b[2]) <= 2, "Head-on faces should share the same screen baseline");
  const svgFixture = (name, markup) => ({ name, mimeType: "image/svg+xml", buffer: Buffer.from(markup) });
  for (const [file, message] of [
    ["examples/logos/Fold-source.svg", "1 selectable part · Vector artwork"],
    [svgFixture("transformed.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -20 100 70">
      <g transform="translate(-30 -15)" fill="#143591">
        <circle cx="24" cy="28" r="18"/><ellipse transform="rotate(16 58 28)" cx="58" cy="28" rx="8" ry="16"/>
      </g></svg>`), "2 selectable parts · Vector artwork"],
    [svgFixture("composited.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" opacity="0.75" fill="#345678"/></svg>`), "1 selectable part"],
  ]) {
    await p.locator("#upload").setInputFiles(file);
    const label = typeof file === "string" ? file.split("/").at(-1) : file.name;
    await p.waitForFunction((text) => document.querySelector("#logoMsg").textContent.includes(text), `${label} · ${message}`);
    assert.equal((await p.locator("#logoMsg").textContent()).includes("Vector artwork"), label !== "composited.svg");
  }
  const largePng = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1152;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1b5594";
    ctx.fillRect(16, 16, 1120, 1120);
    ctx.clearRect(300, 300, 552, 552);
    return c.toDataURL("image/png").split(",")[1];
  });
  await p.locator("#upload").setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.from(largePng, "base64") });
  await p.waitForFunction(() => document.querySelector("#logoMsg").textContent.startsWith("large.png · 1 selectable part"));
  assert.ok(!(await p.locator("#logoMsg").textContent()).includes("Small image"));
  const uploadResponse = p.waitForResponse((r) => r.request().method() === "POST" && r.url() === origin + "/api/jobs");
  await p.click("#export");
  const largeJob = await (await uploadResponse).json();
  assert.deepEqual(largeJob.errors, []);
  const largeId = largeJob.ids[0];
  assert.ok(largeId, "Server should accept an image exceeding the old raster and body limits");
  const listing = await (await fetch(origin + "/api/jobs")).json();
  assert.ok(listing.find(({ id }) => id === largeId).config.logo.w > 512);
  await p.click('[data-action="cancel"][data-id="' + largeId + '"]');
  await p.click("#back");
  const films = [];
  for (const [key, file, label, part, n] of [
    ["nova", "NOVA.svg", "NOVA · outlined SVG", 1, 4],
    ["fold", "Fold.png", "Fold · transparent PNG", 0, 1],
  ]) {
    await p.locator("#upload").setInputFiles("examples/logos/" + file);
    await p.waitForFunction(
      (file) => document.querySelector("#logoMsg").textContent.startsWith(file),
      file,
    );
    assert.equal(await p.locator("#part option").count(), n);
    await p.selectOption("#part", String(part));
    await p.click("#reset");
    if (key === "nova") {
      await p.selectOption("#part", "0");
      const image = await seek(1.04);
      const points = await p.evaluate(async (src) => {
        const i = new Image();
        i.src = src;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.width;
        c.height = i.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(i, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data,
          hits = [];
        for (let j = 0; j < d.length; j += 4)
          if (d[j] > 235 && d[j + 1] > 120 && d[j + 1] < 150 && d[j + 2] < 115)
            hits.push([(j / 4) % c.width, Math.floor(j / 4 / c.width)]);
        const xs = hits.map((v) => v[0]),
          ys = hits.map((v) => v[1]),
          x = (Math.min(...xs) + Math.max(...xs)) / 2,
          y = (Math.min(...ys) + Math.max(...ys)) / 2;
        return [
          [x, y],
          [(x + Math.min(...xs) * 3) / 4, y],
        ].map(([x, y]) => [x / c.width, y / c.height]);
      }, image);
      const box = await p.locator("canvas").boundingBox();
      for (const [i, [u, v]] of points.entries()) {
        await p.mouse.click(box.x + u * box.width, box.y + v * box.height);
        assert.equal(
          await p.inputValue("#part"),
          String(i),
          "Hole should miss; O stroke should select part 2",
        );
      }
      const ceiling = await seek(379 / 30);
      const recovered = await seek(16.5);
      assert.notEqual(ceiling, recovered, "Preview should include the crash and recovery");
      assert.equal(await seek(379 / 30), ceiling, "Seeking back to the crash reconstructs the same frame");
      await seek(13.1);
      await p.click("#play");
      await p.waitForFunction(() => Number(document.querySelector("#scrub").value) > 13.2);
      await p.click("#play");
      assert.doesNotMatch(await p.locator("#notice").textContent(), /Audio (device )?unavailable/);
    }
    for (const variant of ["standard", "matched"]) {
      if (variant === "matched") await p.click("#match");
      const lamp = await p.inputValue("#lamp"),
        background = await p.inputValue("#background");
      const response = p.waitForResponse(
        (r) =>
          r.request().method() === "POST" && r.url() === origin + "/api/jobs",
      );
      await p.click("#export");
      const { ids, errors } = await (await response).json();
      assert.equal(errors.length, 0);
      assert.equal(ids.length, 1);
      films.push({ id: ids[0], key, label, variant, lamp, background, part });
      await p.click("#back");
    }
  }
  await p.check('[value="name"][name="mode"]');
  assert.equal(await p.getAttribute("#scrub", "max"), "13");
  assert.equal(await p.inputValue("#name"), "Zoë");
  assert.equal(await p.inputValue("#lamp"), "#947aca");
  assert.equal(
    await p.getAttribute('[data-letter="2"]', "aria-pressed"),
    "true",
  );
  assert.equal(
    await p.getAttribute('[data-format="square"]', "aria-pressed"),
    "true",
  );
  assert.equal(await seek(6.12), before);
  const stills = [];
  for (const f of films) {
    let job;
    const until = Date.now() + 300000;
    do {
      job = (await (await fetch(origin + "/api/jobs")).json()).find(
        (j) => j.id === f.id,
      );
      if (job.status === "failed") throw Error(job.error);
      if (job.status !== "complete") await sleep(500);
    } while (job.status !== "complete" && Date.now() < until);
    assert.equal(job.status, "complete");
    assert.equal(job.frames, 498);
    assert.equal(job.config.target, f.part);
    assert.equal(job.config.lamp, f.lamp);
    assert.equal(job.config.background, f.background);
    if (f.key === "nova") assert.deepEqual(job.config.logo, { format: "svg" });
    const path = `${out}/${f.key}-${f.variant}.mp4`,
      r = await fetch(origin + "/api/download/" + f.id);
    assert.ok(r.ok);
    await writeFile(path, Buffer.from(await r.arrayBuffer()));
    const info = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-count_frames",
          "-show_streams",
          "-of",
          "json",
          path,
        ]),
      ),
      [v, a] = info.streams;
    assert.deepEqual(
      [
        v.width,
        v.height,
        v.codec_name,
        v.pix_fmt,
        v.nb_read_frames,
        v.duration,
        a.codec_name,
        a.channels,
        a.sample_rate,
      ],
      [1920, 1080, "h264", "yuv420p", "498", "16.600000", "aac", 2, "48000"],
    );
    const pixels = ff(
      "-i",
      path,
      "-vf",
      "select='eq(n,490)',scale=960:540",
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    );
    const luma = (i) =>
      [0.2126, 0.7152, 0.0722].reduce((l, k, c) => {
        const n = pixels[i + c] / 255;
        return (
          l + k * (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    f.contrast = {};
    for (const fill of f.key === "nova"
      ? ["00635e", "fa875e"]
      : ["fff4da", "e4a94a"]) {
      const color = [0, 2, 4].map((i) => parseInt(fill.slice(i, i + 2), 16)),
        ratios = [];
      let x0 = 960,
        x1 = 0,
        y0 = 540,
        y1 = 0;
      for (let y = 220; y < 365; y++)
        for (let x = 90; x < 720; x++) {
          const i = (y * 960 + x) * 3;
          if (color.every((v, c) => Math.abs(pixels[i + c] - v) < 13)) {
            const a = luma(i),
              b = luma((y * 960 + 30) * 3);
            ratios.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      assert.ok(ratios.length > 100, `Missing rendered brand fill ${fill}`);
      f.contrast["#" + fill] = +ratios
        .sort((a, b) => a - b)
        [ratios.length >> 1].toFixed(2);
      if (fill === "fa875e") {
        const center =
          (Math.round((y0 + y1) / 2) * 960 + Math.round((x0 + x1) / 2)) * 3;
        assert.ok(
          color.some((v, c) => Math.abs(v - pixels[center + c]) > 30),
          "The O counter filled in",
        );
      }
    }
    for (const frame of [0, 379, 490])
      stills.push(
        ff(
          "-i",
          path,
          "-vf",
          `select='eq(n,${frame})',scale=420:-2`,
          "-frames:v",
          "1",
          "-c:v",
          "png",
          "-f",
          "image2pipe",
          "pipe:1",
        ).toString("base64"),
      );
  }
  const sheet = await p.evaluate(
    async ({ stills, films }) => {
      const c = document.createElement("canvas");
      c.width = 1260;
      c.height = 40 + 4 * 274;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#191c1b";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = "17px sans-serif";
      ctx.fillStyle = "#edece3";
      [
        "Original artwork",
        "Ceiling contact · 12.63 s",
        "Restored artwork · 16.33 s",
      ].forEach((s, i) => ctx.fillText(s, 12 + i * 420, 26));
      for (let i = 0; i < stills.length; i++) {
        const row = Math.floor(i / 3),
          f = films[row],
          y = 40 + row * 274,
          img = new Image();
        img.src = "data:image/png;base64," + stills[i];
        await img.decode();
        ctx.drawImage(img, 420 * (i % 3), y + 30, 420, 236);
        ctx.fillStyle = "#edbc79";
        ctx.fillText(
          `${f.label}   /   ${f.variant}   /   backdrop ${f.background}   /   lamp ${f.lamp}`,
          12,
          y + 20,
        );
      }
      return c.toDataURL("image/jpeg", 0.95).split(",")[1];
    },
    { stills, films },
  );
  await writeFile(out + "/comparison.jpg", Buffer.from(sheet, "base64"));
  await writeFile(out + "/results.json", JSON.stringify(films, null, 2) + "\n");
  assert.deepEqual(errors, []);
  console.log(
    "Verified four 498-frame exports, original and spaced logo layouts, crash scrubbing, vector SVGs, flat PNG/JPEG extraction, a large raster job, invalid artwork rejection and identical Name pose after switching.",
    films,
  );
} finally {
  await browser?.close();
  service.kill("SIGTERM");
}
