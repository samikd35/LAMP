// Run after rendering the same title with the editable rig. Keep native frame
// indices for the analysis; only the side-by-side viewing copy is resampled.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const reference = "references/PIXAR_logo-50rAKjuTXbc.mp4",
  revised = "samples/recreated-title.mp4";
const ff = (...args) =>
  execFileSync("ffmpeg", ["-loglevel", "error", ...args], { maxBuffer: 24e6 });
const rows = [
  "film,frame,seconds,mean_luma_change_8bit,mono_rms_dbfs,mono_peak_dbfs",
];
for (const [label, path] of [
  ["reference", reference],
  ["first", "samples/first-version.mp4"],
  ["revised", revised],
]) {
  const info = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path,
    ]),
  );
  const video = info.streams.find((s) => s.codec_type === "video"),
    [n, d] = video.r_frame_rate.split("/").map(Number),
    fps = n / d;
  const data = ff(
    "-i",
    path,
    "-map",
    "0:v:0",
    "-vf",
    "scale=160:90",
    "-pix_fmt",
    "gray",
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "pipe:1",
  );
  const pcm = info.streams.some((s) => s.codec_type === "audio")
    ? ff(
        "-i",
        path,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-f",
        "f32le",
        "pipe:1",
      )
    : null;
  for (let i = 0; i < data.length / 14400; i++) {
    let delta = 0,
      rms = 0,
      peak = 0,
      start = Math.round((i * 24000) / fps),
      end = Math.min(Math.round(((i + 1) * 24000) / fps), pcm?.length / 4 || 0);
    if (i)
      for (let j = 0; j < 14400; j++)
        delta += Math.abs(data[i * 14400 + j] - data[(i - 1) * 14400 + j]);
    if (pcm)
      for (let j = start; j < end; j++) {
        const x = pcm.readFloatLE(j * 4);
        rms += x * x;
        peak = Math.max(peak, Math.abs(x));
      }
    const db = (x) => (20 * Math.log10(Math.max(1e-8, x))).toFixed(2);
    rows.push(
      [
        label,
        i,
        (i / fps).toFixed(6),
        (delta / 14400).toFixed(4),
        pcm ? db(Math.sqrt(rms / (end - start))) : "",
        pcm ? db(peak) : "",
      ].join(","),
    );
  }
}
await writeFile("references/frame-study.csv", rows.join("\n") + "\n");
ff(
  "-y",
  "-i",
  "references/original-no-subtitle.mp4",
  "-i",
  revised,
  "-filter_complex",
  "[0:v]fps=30,scale=960:540,setsar=1[left];[1:v]scale=960:540,setsar=1[right];[left][right]hstack=shortest=1[v]",
  "-map",
  "[v]",
  "-map",
  "1:a",
  "-map",
  "0:a",
  "-t",
  "13",
  "-c:v",
  "libx264",
  "-crf",
  "16",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "copy",
  "-metadata:s:a:0",
  "handler_name=Recreated foley",
  "-metadata:s:a:1",
  "handler_name=Reference sound",
  "-disposition:a:0",
  "default",
  "-disposition:a:1",
  "0",
  "-movflags",
  "+faststart",
  "samples/comparison.mp4",
);
console.log(
  `${rows.length - 1} native frame measurements; reference left / editable rig right; two selectable soundtracks.`,
);
