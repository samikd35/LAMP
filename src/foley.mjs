import { steps, strikes } from "./timeline.mjs";
// One deterministic stereo master for Web Audio and FFmpeg. The source film
// provides cue timings only; none of its recordings enter a personalized job.
export const sampleRate = 48000;
export function soundtrack(config) {
  const n = Math.round(config.duration * sampleRate),
    channels = [new Float32Array(n), new Float32Array(n)];
  let state = 0x31eaf67 ^ (config.seed ?? 0);
  const noise = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
  const tau = 2 * Math.PI,
    panTarget =
      0.64 *
      (Math.min(
        1,
        config.target / Math.max(1, Array.from(config.name).length - 1),
      ) -
        0.5);
  function sound(frame, secs, amp, pan, model) {
    const start = Math.round((frame / 312) * n),
      L = Math.sqrt((1 - pan) / 2),
      R = Math.sqrt((1 + pan) / 2);
    let lo = 0,
      prev = 0;
    for (let i = 0; i < secs * sampleRate && start + i < n; i++) {
      const t = i / sampleRate,
        w = noise();
      lo += 0.14 * (w - lo);
      const x = model(t, w - prev, lo) * amp;
      prev = w;
      channels[0][start + i] += x * L;
      channels[1][start + i] += x * R;
    }
  }
  function foot(f, mass, pan, pitch) {
    sound(f, 0.47, mass, pan, (t, h, l) => {
      const attack = 1 - Math.exp(-2000 * t),
        body =
          Math.sin(tau * (pitch * t + 0.84 * (1 - Math.exp(-31 * t)))) *
          Math.exp(-t * 19);
      return (
        attack *
        (body * 0.83 +
          0.31 * Math.sin(tau * pitch * 2.68 * t) * Math.exp(-t * 43) +
          0.23 * l * Math.exp(-t * 55) +
          0.13 * h * Math.exp(-t * 310) +
          0.16 * Math.sin(tau * 784 * t) * Math.exp(-t * 79))
      );
    });
  }
  function hinge(f, len, a, pan, freq, slide) {
    sound(f, len, a, pan, (t, h, l) => {
      const u = t / len,
        env = Math.sin(Math.PI * u) ** 1.5,
        phase =
          tau * freq * (t + 0.5 * slide * t * u) + 0.7 * Math.sin(tau * 38 * t);
      return (
        env *
        (0.57 * Math.sin(phase) +
          0.17 * Math.sin(phase * 2.013) +
          0.33 * l +
          0.045 * h) *
        (1 + 0.22 * Math.sin(tau * 61 * t))
      );
    });
  }
  steps.forEach((f, i) => {
    const pan = 0.83 + ((panTarget - 0.83) * i) / (steps.length - 1);
    foot(
      f,
      [0.14, 0.23, 0.32, 0.47, 0.42, 0.38, 0.23, 0.26][i],
      pan,
      164 - 7 * i,
    );
    hinge(f + 0.85, 0.11, 0.032 + i * 0.004, pan, 680 + i * 21, -0.29);
  });
  hinge(109, 0.29, 0.09, panTarget, 775, 0.45);
  hinge(122, 0.46, 0.064, panTarget, 2190, -0.08);
  hinge(132, 0.18, 0.095, panTarget, 1060, 0.62);
  strikes.forEach((f, i) => {
    foot(
      f,
      [0.45, 0.4, 0.47, 0.54, 1.26][i],
      panTarget,
      [133, 146, 127, 111, 59][i],
    );
    hinge(f + 1.3, 0.13, 0.045, panTarget, 920 - i * 83, -0.32);
  });
  hinge(184, 0.29, 0.15, panTarget, 1450, 0.78);
  hinge(191, 0.25, 0.065, panTarget, 3690, -0.52);
  hinge(213, 0.16, 0.058, panTarget, 920, -0.22);
  hinge(224, 0.23, 0.064, panTarget, 1270, 0.28);
  hinge(255, 0.24, 0.064, panTarget, 940, -0.41);
  if (config.ending === "restore") {
    hinge(257, 0.18, 0.083, panTarget, 1240, 0.45);
    foot(274, 0.46, 0.54, 119);
  }
  // Short asymmetric early reflections, not a continuous music bed.
  let peak = 0;
  for (let i = n - 1; i >= 0; i--) {
    const l = channels[0][i],
      r = channels[1][i];
    channels[0][i] =
      l +
      (i > 649 ? 0.11 * channels[1][i - 649] : 0) +
      (i > 1850 ? 0.042 * channels[0][i - 1850] : 0);
    channels[1][i] =
      r +
      (i > 847 ? 0.1 * channels[0][i - 847] : 0) +
      (i > 2012 ? 0.048 * channels[1][i - 2012] : 0);
    peak = Math.max(peak, Math.abs(channels[0][i]), Math.abs(channels[1][i]));
  }
  for (const ch of channels)
    for (let i = 0; i < n; i++) ch[i] = (ch[i] * 0.43) / peak;
  return channels;
}
export function wave(config) {
  const [l, r] = soundtrack(config),
    size = l.length * 4,
    buf = new ArrayBuffer(44 + size),
    v = new DataView(buf),
    text = (p, s) =>
      [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, size + 36, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, size, true);
  for (let i = 0; i < l.length; i++) {
    v.setInt16(44 + 4 * i, Math.round(l[i] * 32767), true);
    v.setInt16(46 + 4 * i, Math.round(r[i] * 32767), true);
  }
  return new Uint8Array(buf);
}
