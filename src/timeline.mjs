// Exposure sheet in 24 Hz reference frames. Export samples these continuous
// curves at 30 Hz; changing output fps never changes the performance.
export const chapters = [
  ["Title", 0],
  ["Arrival", 22 / 24],
  ["Turn", 93 / 24],
  ["Wind-up", 111 / 24],
  ["Strikes", 145 / 24],
  ["Inspect", 200 / 24],
  ["Reveal", 255 / 24],
];
export const steps = [22, 34, 45, 56, 69, 79, 87, 93];
export const strikes = [145, 156, 167, 180, 200];
export const logoTiming = Object.freeze({
  pullback: 0.78,
  wide: 3.17,
  arrival: 3.3,
  spring: 365 / 30,
  release: 369 / 30,
  ceilingHit: 379 / 30,
  ceilingPress: 382 / 30,
  floorHit: 408 / 30,
  stand: 416 / 30,
  upright: 434 / 30,
  hop: 443 / 30,
  sideLand: 462 / 30,
});
export const logoChapters = [
  ["Logo", 0],
  ["Pullback", logoTiming.pullback],
  ["Arrival", logoTiming.arrival],
  ["Wind-up", logoTiming.arrival + 111 / 24],
  ["Strikes", logoTiming.arrival + strikes[0] / 24],
  ["Ceiling", logoTiming.ceilingHit],
  ["Recovery", logoTiming.floorHit],
];
const clamp = (x) => Math.max(0, Math.min(1, x)),
  ease = (x) => x * x * (3 - 2 * x),
  mix = (a, b, u) => a + (b - a) * u;
function key(f, keys) {
  for (let i = 1; i < keys.length; i++) {
    const [b, y] = keys[i],
      [a, x] = keys[i - 1];
    if (f <= b) return mix(x, y, ease(clamp((f - a) / (b - a))));
  }
  return keys.at(-1)[1];
}
const turns = [
  [0, 168],
  [80, 168],
  [88, 195],
  [99, 228],
  [107, 243],
  [115, 322],
  [122, 352],
  [139, 352],
  [145, 359],
  [201, 357],
  [209, 355],
  [222, 355],
  [229, 348],
  [255, 348],
  [268, 353],
  [287, 352],
];
const gaze = [
  [0, -3],
  [86, -4],
  [96, 7],
  [106, -13],
  [117, 15],
  [131, 21],
  [136, -14],
  [143, -4],
  [200, 6],
  [204, 21],
  [212, -9],
  [217, 37],
  [222, 53],
  [230, 5],
  [252, 3],
  [264, -22],
  [274, -24],
  [287, -21],
];
const headTurn = [
  [0, 0],
  [202, 0],
  [214, 0],
  [222, 33],
  [228, 0],
  [254, 0],
  [266, 91],
  [276, 98],
  [286, 96],
];
export function evaluate(seconds, duration, s, ending = "replace") {
  const f = clamp(seconds / duration) * 312;
  let squash = key(f, [
    [0, 1],
    [145, 1],
    [147, 0.87],
    [156, 0.87],
    [158, 0.68],
    [167, 0.68],
    [169, 0.49],
    [180, 0.49],
    [182, 0.34],
    [199, 0.34],
    [200, 0.31],
    [202, 0.001],
  ]);
  if (ending === "restore" && f >= 257)
    squash = key(f, [
      [257, 0.001],
      [265, 1.045],
      [270, 0.982],
      [275, 1],
    ]);
  const surface = (s.height - s.baseline) * squash + s.baseline;
  let x = s.start,
    y = 0,
    z = -0.86,
    tilt = 0,
    fold = 0.12,
    lag = 0;
  // Flight x is almost linear. The foot brakes only during contact, not at
  // the top of every arc. Each rebound has its own planted exposure(s).
  function jump(a, b, from, to, z0, z1, y0, y1, apex, roll, dip = 1) {
    if (f < a) return;
    const u = clamp((f - a) / (b - a)),
      arc = 4 * u * (1 - u),
      land = f - b;
    x = mix(from, to, mix(u, ease(u), 0.13));
    z = mix(z0, z1, ease(u));
    y = mix(y0, y1, u) + apex * arc;
    if (f < b) {
      tilt = roll * Math.sin(Math.PI * u) * Math.cos(Math.PI * u * 0.78);
      fold = key(u, [
        [0, -0.76],
        [0.32, 0.21],
        [0.58, 0.42],
        [0.88, -0.23],
        [1, -0.12],
      ]);
      lag = -11 * Math.sin(2 * Math.PI * u);
    } else {
      tilt = 0;
      fold = key(land, [
        [0, -0.12],
        [1.35, dip],
        [3.6, 0.23],
        [6, -0.04],
        [9, 0.12],
      ]);
      lag = 13 * Math.sin(land * 0.84) * Math.exp(-land * 0.36);
    }
  }
  const path = [0, 0.1, 0.245, 0.42, 0.61, 0.8, 0.925, 0.984, 1],
    heights = [0.49, 0.64, 0.71, 0.68, 0.83, 0.57, 0.35, 0.14];
  const depth = [-0.88, -0.88, -0.88, -0.88, -0.88, -0.88, -0.82, -0.59, 0.08];
  for (let i = 0; i < steps.length; i++)
    jump(
      i ? steps[i - 1] + 1.8 : 10,
      steps[i],
      mix(s.start, s.approach, path[i]),
      mix(s.start, s.approach, path[i + 1]),
      depth[i],
      depth[i + 1],
      0,
      0,
      heights[i],
      -16,
      0.84,
    );
  if (f >= 96) {
    fold = key(f, [
      [96, 0.42],
      [101, -0.13],
      [109, -0.18],
      [115, 0.21],
      [120, 0.85],
      [126, 1.02],
      [131, 0.85],
      [133, 1.06],
    ]);
    lag = 0;
  }
  jump(133.3, 145, s.approach, s.target, depth[8], 0.08, 0, s.height, 1.42, 18);
  const levels = [0.87, 0.68, 0.49, 0.34],
    arches = [0.93, 1.09, 1.37, 2.37];
  for (let i = 0; i < 4; i++)
    jump(
      strikes[i] + (i === 3 ? 4.7 : 3.3),
      strikes[i + 1],
      s.target,
      s.target,
      0.08,
      0.08,
      (s.height - s.baseline) * levels[i] + s.baseline,
      (s.height - s.baseline) * levels[i] + s.baseline,
      arches[i],
      i === 3 ? 16 : 8,
      1.03,
    );
  if (
    f >= 145 &&
    !strikes
      .slice(0, -1)
      .some((n, i) => f > n + (i === 3 ? 4.7 : 3.3) && f < strikes[i + 1])
  )
    y = surface;
  if (f >= 202)
    fold = key(f, [
      [202, 1.03],
      [207, 0.18],
      [212, -0.1],
      [218, 0.64],
      [222, 0.85],
      [230, 0.23],
      [253, 0.2],
      [261, 0.13],
      [270, -0.21],
      [277, -0.08],
      [289, 0.01],
    ]);
  if (ending === "restore" && f >= 252) {
    if (f < 257)
      fold = key(f, [
        [252, 0.2],
        [255, 0.94],
        [257, -0.55],
      ]);
    jump(257, 274, s.target, s.end, 0.08, 0.55, s.baseline, 0, 1.63, 16);
  }
  return {
    x,
    y,
    z,
    tilt,
    fold,
    squash,
    look: key(f, gaze) + lag,
    yaw: key(f, turns),
    neck: key(f, headTurn),
  };
}
