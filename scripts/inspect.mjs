// Visual regression artifacts, using editor poses and decoded 1x MP4 playback.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { openBrowser } from "../server/worker.mjs";
const origin = `http://127.0.0.1:${process.env.PORT ?? 4173}`;
await mkdir("outputs", { recursive: true });
const tmp = await mkdtemp("outputs/inspection-"),
  browser = await openBrowser();
try {
  const p = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  await p.goto(origin + "/studio.html");
  await p.waitForSelector("#loading[hidden]", { state: "attached" });
  const cases = [
    ["I", "landscape", 8.01],
    ["A", "portrait", 6.14],
    ["WWW", "square", 9],
    ["ILLI", "landscape", 6.14],
    ["O'Connor", "landscape", 2.85],
    ["O’Connor", "square", 9.6],
    ["Mary Jane", "square", 5.6],
    ["W".repeat(24), "portrait", 8.01],
    ["Anne-Marie", "portrait", 9.6],
  ];
  let i = 0;
  for (const [n, a, t] of cases) {
    await p.fill("#name", n);
    await p.click(`[data-format="${a}"]`);
    const image = await p.evaluate(
      ({ n, t }) => {
        const s = document.querySelector("#scrub");
        s.value = t;
        s.dispatchEvent(new Event("input"));
        const src = document.querySelector("canvas"),
          c = document.createElement("canvas");
        c.width = 340;
        c.height = 245;
        const ctx = c.getContext("2d"),
          scale = Math.min(340 / src.width, 215 / src.height);
        ctx.fillStyle = "#191c19";
        ctx.fillRect(0, 0, 340, 245);
        ctx.drawImage(
          src,
          (340 - src.width * scale) / 2,
          (215 - src.height * scale) / 2,
          src.width * scale,
          src.height * scale,
        );
        ctx.font = "13px monospace";
        ctx.fillStyle = "#f2d7a1";
        ctx.fillText(n + " / " + t + "s", 9, 234);
        return c.toDataURL("image/jpeg", 0.96).split(",")[1];
      },
      { n, t },
    );
    await writeFile(`${tmp}/${i++}.jpg`, Buffer.from(image, "base64"));
  }
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    `${tmp}/%d.jpg`,
    "-vf",
    "tile=3x3",
    "-frames:v",
    "1",
    "samples/layout-checks.jpg",
  ]);
  const job = (await (await fetch(origin + "/api/jobs")).json()).findLast(
    (j) => j.status === "complete" && j.config.name === "SAMUEL",
  );
  if (!job) throw Error("Run npm run verify first.");
  const stats = await p.evaluate(async (url) => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = URL.createObjectURL(await (await fetch(url)).blob());
    document.body.replaceChildren(v);
    v.style.width = "100%";
    const ended = new Promise((resolve, reject) => {
      v.onended = resolve;
      v.onerror = () => reject(Error(v.error?.message));
    });
    await v.play();
    await ended;
    URL.revokeObjectURL(v.src);
    return {
      duration: v.duration,
      rate: v.playbackRate,
      dimensions: [v.videoWidth, v.videoHeight],
      quality: v.getVideoPlaybackQuality().totalVideoFrames,
    };
  }, "/api/download/" + job.id);
  console.log("Completed real-time browser playback:", stats);
} finally {
  await browser.close();
  await rm(tmp, { recursive: true, force: true });
}
