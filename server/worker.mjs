import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  rename,
  access,
} from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { presets } from "../src/config.mjs";
import { wave, sampleRate } from "../src/foley.mjs";
const exec = promisify(execFile);
export async function openBrowser() {
  const options = {
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  };
  if (process.env.CHROMIUM_PATH)
    return chromium.launch({
      ...options,
      executablePath: process.env.CHROMIUM_PATH,
    });
  try {
    return await chromium.launch({ ...options, channel: "chromium" });
  } catch (first) {
    try {
      return await chromium.launch({ ...options, channel: "chrome" });
    } catch {
      throw Error(
        `Chromium unavailable. Run npx playwright install chromium, or set CHROMIUM_PATH. ${first.message}`,
      );
    }
  }
}
export async function render(job, { dir, origin, signal }) {
  const run = async (cmd, args) => {
    try {
      return await exec(cmd, args, { signal, maxBuffer: 4 * 1024 * 1024 });
    } catch (e) {
      if (e.code === "ENOENT")
        throw Error(
          `${cmd} not found. Install FFmpeg with libx264 and ffprobe on PATH.`,
        );
      throw e;
    }
  };
  await mkdir(dir, { recursive: true });
  await access(dir, constants.W_OK);
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-encoders"]);
  if (!stdout.includes("libx264 "))
    throw Error(
      "FFmpeg lacks libx264. Install a build with the H.264 encoder enabled.",
    );
  await run("ffprobe", ["-version"]);
  if (!/\baac\s/.test(stdout))
    throw Error("FFmpeg lacks the AAC audio encoder.");
  const tmp = await mkdtemp(path.join(dir, ".frames-"));
  let browser;
  const stop = () => {
    void browser?.close().catch(() => {});
  };
  signal.addEventListener("abort", stop);
  try {
    browser = await openBrowser();
    signal.throwIfAborted();
    const cfg = job.config,
      [w, h] = presets[cfg.aspect];
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
    });
    await page.goto(origin + "/render.html");
    await page.waitForFunction(() => typeof window.prepare === "function");
    await page.evaluate((c) => window.prepare(c), cfg);
    for (let i = 0; i < cfg.duration * cfg.fps; i++) {
      signal.throwIfAborted();
      const jpeg = await page.evaluate((t) => window.frame(t), i / cfg.fps);
      await writeFile(
        path.join(tmp, `${String(i).padStart(4, "0")}.jpg`),
        Buffer.from(jpeg, "base64"),
      );
      job.frames = i + 1;
    }
    job.status = "encoding";
    await browser.close();
    browser = null;
    const mp4 = path.join(tmp, "film.mp4");
    const audio = path.join(tmp, "foley.wav");
    await writeFile(audio, wave(cfg));
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      String(cfg.fps),
      "-i",
      path.join(tmp, "%04d.jpg"),
      "-i",
      audio,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-vf",
      "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "fast",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "iec61966-2-1",
      "-movflags",
      "+faststart",
      mp4,
    ]);
    const info = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          mp4,
        ])
      ).stdout,
    );
    const v = info.streams[0];
    const a = info.streams.find((s) => s.codec_type === "audio");
    if (
      a?.codec_name !== "aac" ||
      a.channels !== 2 ||
      +a.sample_rate !== sampleRate ||
      Math.abs(+a.duration - cfg.duration) > 0.025
    )
      throw Error("Encoded stereo foley failed validation.");
    if (
      v.codec_name !== "h264" ||
      v.pix_fmt !== "yuv420p" ||
      v.width !== w ||
      v.height !== h ||
      +v.nb_frames !== job.frames ||
      +v.duration !== cfg.duration ||
      v.avg_frame_rate !== `${cfg.fps}/1` ||
      !info.format.format_name.includes("mp4")
    )
      throw Error("Encoded file failed ffprobe validation.");
    signal.throwIfAborted();
    await rename(mp4, path.join(dir, job.file));
  } finally {
    signal.removeEventListener("abort", stop);
    await browser?.close().catch(() => {});
    await rm(tmp, { recursive: true, force: true });
  }
}
