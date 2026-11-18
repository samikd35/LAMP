// Repair only the lower credit strip, interpolating from the surrounding
// clean plate at each timestamp (including the fade). Never retime the shot.
import { execFileSync } from "node:child_process";
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "references/PIXAR_logo-50rAKjuTXbc.mp4",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-vf",
    "delogo=x=1136:y=702:w=522:h=50:enable='gte(n,230)'",
    "-fps_mode",
    "passthrough",
    "-c:v",
    "libx264",
    "-crf",
    "13",
    "-preset",
    "medium",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    "references/original-no-subtitle.mp4",
  ],
  { stdio: "inherit" },
);
