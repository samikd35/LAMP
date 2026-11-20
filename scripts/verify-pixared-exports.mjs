// Run after npm run build. This starts its own Studio server and renders two real MP4s.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openBrowser } from "../server/worker.mjs";

const port = process.env.PIXARED_VERIFY_PORT ?? "4194";
const origin = "http://127.0.0.1:" + port;
const scratch = await mkdtemp(path.join(tmpdir(), "pixared-mp4-"));
const results = process.env.PIXARED_VERIFY_OUT ?? scratch;
const browser = await openBrowser();
let server;
try {
  await mkdir(results, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("chrome://version");
  const executable = (await page.locator("#executable_path").innerText()).trim();
  // A macOS Chromium executable must stay inside its complete .app bundle.
  const application = executable.match(/^(.*?\.app)\//)?.[1] ?? executable;
  const install = path.dirname(application);
  const renderBin = path.join(scratch, "render-browser");
  // Simulate a real recoverable outage in the worker. The UI and job API both run normally.
  server = spawn(process.execPath, ["server/studio.mjs"], {
    env: { ...process.env, PORT: port, CHROMIUM_PATH: path.join(renderBin, path.relative(install, executable)) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(([code]) => { throw Error("Studio startup failed: " + code); }),
  ]);
  const seenErrors = [];
  page.on("pageerror", (error) => seenErrors.push(error.message));
  const submitted = [];
  const retries = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/jobs") submitted.push(request.postDataJSON().entries[0]);
    if (pathname.endsWith("/retry")) retries.push(pathname);
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const status = page.getByRole("status");
  const download = page.getByRole("link", { name: "Download MP4", exact: true });

  async function saveFilm(name, frames) {
    await Promise.race([
      download.waitFor({ timeout: 900000 }),
      button("Retry render").waitFor({ timeout: 900000 }).then(async () => {
        throw Error("Render failed: " + await status.textContent());
      }),
    ]);
    const save = page.waitForEvent("download");
    await download.click();
    const file = await save;
    const output = path.join(results, name + ".mp4");
    await file.saveAs(output);
    const { streams } = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_streams", "-of", "json", output,
    ]));
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    assert.equal(video.codec_name, "h264");
    assert.equal(Number(video.nb_frames), frames);
    assert.equal(Number(video.duration), frames / 30);
    assert.equal(audio.codec_name, "aac");
    assert.equal(audio.channels, 2);
    assert.equal(audio.sample_rate, "48000");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "6.2", "-i", output,
      "-frames:v", "1", "-vf", "scale=320:-2", path.join(results, name + ".jpg")]);
    console.log("Verified", name, video.width + "×" + video.height, video.duration + "s", file.suggestedFilename());
    return [video.width, video.height];
  }

  await page.goto(origin);
  await page.getByRole("textbox", { name: "Your name" }).fill("Sam");
  await button("Play my preview").click();
  await button("Pause").click();
  assert.equal(submitted.length, 0);
  await button("Prepare MP4").click();
  await button("Retry render").waitFor();
  assert.match(await status.textContent(), /Sam/);
  assert.match(await status.textContent(), /render browser/i);
  console.log("Verified recoverable worker failure for Sam");

  const secondVisitor = await browser.newPage();
  await secondVisitor.goto(origin);
  await secondVisitor.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await secondVisitor.getByRole("button", { name: "Retry render" }).count(), 0);
  await secondVisitor.close();

  await symlink(install, renderBin, process.platform === "win32" ? "junction" : "dir");
  await button("Retry render").click();
  await button("Preparing…").waitFor();
  // The saved name is rendering while the visitor edits and plays a different logo draft.
  await button("Edit").click();
  await page.locator('input[type="file"]').setInputFiles("examples/logos/NOVA.svg");
  await page.getByText("NOVA.svg", { exact: true }).waitFor();
  await button("Film settings").click();
  await page.getByLabel("Film shape").selectOption("square");
  await button("Play my preview").click();
  await button("Pause").click();
  assert.deepEqual(await saveFilm("Sam", 390), [1920, 1080]);
  assert.match(await status.textContent(), /Sam/);
  assert.equal(retries.length, 1);
  const savedId = retries[0].split("/")[3];
  assert.equal(await download.getAttribute("href"), "/api/download/" + savedId);
  await button("Prepare current film").click();
  assert.deepEqual(await saveFilm("NOVA", 498), [1080, 1080]);
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].name, "Sam");
  assert.match(submitted[1].name, /NOVA/);
  assert.ok(submitted[1].logo);
  assert.equal(submitted[1].aspect, "square");
  assert.deepEqual(seenErrors, []);
} finally {
  await browser.close();
  if (server?.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  await rm(scratch, { recursive: true, force: true });
}
