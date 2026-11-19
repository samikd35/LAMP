import * as T from "three";
import { defaults, logoBackdrop, logoFrameCount } from "./config.mjs";
import { evaluate, logoTiming, steps, strikes } from "./timeline.mjs";
import type { makeLamp } from "./lamp";
import type { makeLogo } from "./logo";
import { placeLamp, planLampClearance } from "./lamp-clearance";

const { clamp, degToRad, lerp, smoothstep, smootherstep } = T.MathUtils;
const {
  pullback, wide, arrival, spring, release, ceilingHit, ceilingPress,
  floorHit, stand, upright, hop, sideLand,
} = logoTiming;
const roomBack = -7.1;
const lampScale = 1.5;
const progress = (time: number, start: number, end: number) =>
  clamp((time - start) / (end - start), 0, 1);
type Lamp = ReturnType<typeof makeLamp>;
type Rig = Parameters<Lamp["pose"]>;

function addRoom(group: T.Group, width: number, height: number, front: number, backdrop: string) {
  const depth = front - roomBack, middle = roomBack + depth / 2;
  const tone = new T.Color(backdrop), paper = new T.Color(logoBackdrop);
  tone.setRGB(tone.r / paper.r, tone.g / paper.g, tone.b / paper.b);
  const tint = (color: string) => new T.Color(color).multiply(tone);
  function surface(length: number, stops: [number, string][]) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (const [at, color] of stops) gradient.addColorStop(at, tint(color).getStyle());
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(new T.PlaneGeometry(width, length), new T.MeshBasicMaterial({ map }));
    group.add(mesh);
    return mesh;
  }
  const wall = surface(height, [[0, "#e9ebee"], [0.19, "#f8f8f7"], [0.79, "#f9f8f6"], [1, "#e6e9ed"]]);
  wall.position.set(0, height / 2, roomBack);
  const floor = surface(depth, [[0, "#e6e9ed"], [0.32, "#eef0f2"], [1, "#dce2e8"]]);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, middle);
  const ceiling = surface(depth, [[0, "#e4e8ed"], [0.72, "#e8ebf0"], [1, "#d8dfe8"]]);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, middle);
  const geometry = new T.PlaneGeometry(0.024, depth);
  const material = new T.MeshBasicMaterial({ color: tint("#d2d9e3") });
  for (const x of [-4.1, 4.1]) {
    const seam = new T.Mesh(geometry, material);
    seam.rotation.x = Math.PI / 2;
    seam.position.set(x, height - 0.0007, middle);
    group.add(seam);
  }
}

function ceilingSpill(group: T.Group, position: T.Vector3, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,229,162,.94)");
  glow.addColorStop(0.46, "rgba(255,234,190,.60)");
  glow.addColorStop(1, "rgba(255,239,202,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const spill = new T.Mesh(
    new T.PlaneGeometry(4.3, 3.8),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  spill.rotation.x = Math.PI / 2;
  spill.position.set(position.x, height - 0.006, position.z);
  group.add(spill);
  return spill;
}

export function makeLogoPerformance(
  group: T.Group, word: ReturnType<typeof makeLogo>, lamp: Lamp, aspect: number, backdrop: string,
) {
  const { height, width, sourceSize } = word;
  const logoLeft = -width / 2;
  const { duration, fps } = defaults;
  const fov = 16, tan = Math.tan(degToRad(fov / 2)), horizontal = tan * aspect;
  const centerY = sourceSize.y / 2;
  const closeDistance = 1.23 * Math.max(sourceSize.x / (2 * horizontal), centerY / tan);
  let wideDistance = Math.max(
    (width + 0.15) / (0.69 * 2 * horizontal),
    (width / 2 + 2.65) / (0.94 * horizontal),
    (6.06 - centerY) / (0.92 * tan),
    closeDistance * 1.16,
  );
  const stage = {
    start: wideDistance * horizontal + 1.65, approach: word.approachX, target: word.targetX,
    height, baseline: 0, end: logoLeft - 1.23,
  };
  const entrance = (time: number) => {
    const action = time - arrival;
    const pose = evaluate(action, duration, stage);
    const rear = 1 - smootherstep(action, steps[5] / 24, steps[7] / 24);
    const onCrown = smootherstep(action, 133.3 / 24, strikes[0] / 24);
    // Interior targets wind up behind the letters, then move forward onto the crown.
    pose.z -= 0.62 * rear + 0.22 * onCrown + (word.behind ? 1.6 * (1 - rear) * (1 - onCrown) : 0);
    return pose;
  };
  lamp.root.scale.setScalar(lampScale);
  word.layout(1);
  const clearance = planLampClearance(lamp, word, null, (p) => entrance(arrival + p * duration),
    Math.ceil((spring - arrival) * fps * 2), lampScale, false, (spring - arrival) / duration);
  const setEntrance = (time: number) => placeLamp(lamp, entrance(time), (time - arrival) / duration, clearance);

  const bounds = new T.Box3();
  function fitLampWidth() {
    bounds.setFromObject(lamp.root, true);
    const edge = Math.max(-bounds.min.x, bounds.max.x);
    wideDistance = Math.max(wideDistance, edge / (0.975 * horizontal) + bounds.max.z);
  }
  // Size the roof from the actual rig at the strike and launch poses.
  let roof = 6.06;
  for (let i = Math.ceil((arrival + steps[7] / 24) * fps); i / fps < spring; i++) {
    setEntrance(i / fps);
    fitLampWidth();
    roof = Math.max(roof, bounds.max.y + 0.15);
  }
  const initial = setEntrance(spring);
  const springRig: Rig = [initial.fold, initial.look, initial.yaw, initial.neck, initial.tilt];
  const tightLaunch = clearance.scale < lampScale || !!clearance.tuck.at(-1);
  const releaseRig: Rig = tightLaunch ? springRig : [-0.47, -77, 354, 0, -5];
  lamp.pose(...releaseRig);
  lamp.root.position.y = height * 1.09;
  const launchTop = bounds.setFromObject(lamp.root, true).max.y;
  roof = Math.max(roof, launchTop + 0.22);
  wideDistance = Math.max(wideDistance, (roof - centerY) / (0.92 * tan));

  const hitX = initial.x - 0.12, hitZ = -0.52;
  const fallX = logoLeft + Math.min(0.53, word.firstWidth / 2), fallZ = -1.72;
  const frames: [number, Rig][] = [
    [spring, springRig],
    [release, releaseRig],
    [ceilingHit, [-0.53, -112, 350, 0, 0]],
    [ceilingPress, [0.85, -112, 350, 0, 0]],
    [ceilingPress + 0.12, [0.68, -65, 321, 0, -31]],
    [floorHit - 0.22, [0.24, 24, 232, 0, -49]],
    [floorHit, [1.12, 83, 171, 0, 0]],
    [stand, [1.12, 83, 171, 0, 0]],
    [upright, [-0.66, -73, 168, -14, 0]],
    [upright + 0.12, [-0.66, -67, 168, -14, 0]],
    [hop, [0.82, 18, 168, -8, 0]],
    [hop + 0.29, [-0.43, -8, 168, 0, -9]],
    [sideLand, [0.76, 9, 168, 0, 0]],
    [sideLand + 0.19, [0.12, 4, 168, 0, 0]],
    [sideLand + 0.64, [0.06, 12, 168, -93, 0]],
  ];
  function setRig(time: number) {
    const next = frames.findIndex(([stamp], i) => i > 0 && time <= stamp);
    if (next < 0) {
      lamp.pose(...frames.at(-1)![1]);
      return;
    }
    const [fromTime, from] = frames[next - 1], [toTime, to] = frames[next];
    const u = smoothstep(time, fromTime, toTime);
    lamp.pose(...from.map((value, i) => lerp(value, to[i], u)) as Rig);
  }
  function footAtRoof() {
    lamp.root.position.y = 0;
    return roof - bounds.setFromObject(lamp.root, true).max.y;
  }
  const rimAtHit = new T.Vector3(), rimNow = new T.Vector3();
  setRig(ceilingHit);
  lamp.root.position.set(hitX, 0, hitZ);
  lamp.rim.getWorldPosition(rimAtHit);
  function pinShade(time: number) {
    setRig(time);
    lamp.root.position.set(hitX, 0, hitZ);
    lamp.rim.getWorldPosition(rimNow);
    const y = footAtRoof();
    lamp.root.position.set(hitX + rimAtHit.x - rimNow.x, y, hitZ + rimAtHit.z - rimNow.z);
  }
  pinShade(ceilingPress);
  const pressed = lamp.root.position.clone();
  const spill = ceilingSpill(group, rimAtHit, roof);
  const beam = lamp.beam.intensity, bulb = lamp.bulbMaterial.emissiveIntensity;

  function ending(time: number) {
    const recoil = progress(time, release, release + 0.38);
    const squash = time < release
      ? lerp(initial.squash, 1.09, progress(time, spring, release) ** 2)
      : 1 + 0.09 * (1 - recoil) ** 2 * Math.cos(recoil * Math.PI * 2);
    if (time >= ceilingHit && time <= ceilingPress) {
      pinShade(time);
      return squash;
    }
    let x = initial.x, y = height * squash, z = initial.z;
    let launchGap: number | undefined;
    if (time >= release && time < ceilingHit) {
      const u = progress(time, release, ceilingHit);
      x = lerp(initial.x, hitX, u);
      z = lerp(initial.z, hitZ, u) - (tightLaunch ? 1.85 * Math.sin(Math.PI * u) : 0);
      launchGap = (roof - launchTop) * (1 - u * (1.52 - 0.52 * u));
    } else if (time > ceilingPress && time < floorHit) {
      const u = progress(time, ceilingPress, floorHit);
      x = lerp(pressed.x, fallX, smoothstep(u, 0, 1));
      z = lerp(pressed.z, fallZ, u);
      y = lerp(pressed.y, 0, u * (0.32 + 0.68 * u));
    } else if (time >= floorHit) {
      const u = progress(time, hop, sideLand);
      x = lerp(fallX, stage.end, u);
      z = lerp(fallZ, 0.42, smoothstep(u, 0.52, 1));
      y = 0.69 * 4 * u * (1 - u);
    }
    setRig(time);
    lamp.root.position.set(x, y, z);
    if (launchGap !== undefined)
      lamp.root.position.y = footAtRoof() - launchGap;
    else if (time > ceilingPress && time < ceilingPress + 0.16)
      lamp.root.position.y = Math.min(y, footAtRoof());
    return squash;
  }
  for (let i = Math.ceil(spring * fps); i < logoFrameCount; i++) {
    ending(i / fps);
    fitLampWidth();
  }
  const camera = new T.PerspectiveCamera(fov, aspect, 0.1, wideDistance - roomBack + 6);
  camera.position.y = centerY;
  stage.start = wideDistance * horizontal + 1.65;
  addRoom(group, 2.1 * (wideDistance - roomBack) * horizontal, roof, wideDistance + 1, backdrop);

  return {
    camera,
    clearance,
    pose(time: number) {
      const reveal = smootherstep(time, pullback, wide);
      word.layout(smootherstep(time, 1, 3.12));
      camera.position.z = lerp(closeDistance, wideDistance, reveal);
      lamp.root.visible = time >= arrival;
      const glow = smoothstep(time, release - 0.03, ceilingHit - 0.055) *
        (1 - smoothstep(time, ceilingPress, ceilingPress + 0.2));
      const sinceHit = time - ceilingHit;
      const flicker = (sinceHit > 0.022 && sinceHit < 0.12) || (sinceHit > 0.17 && sinceHit < 0.235);
      spill.visible = glow > 0;
      spill.material.opacity = 0.84 * glow * (flicker ? 0.14 : 1);
      lamp.beam.intensity = beam * (flicker ? 0.06 : 1);
      lamp.bulbMaterial.emissiveIntensity = bulb * (flicker ? 0.06 : 1);

      let squash = 1;
      if (time >= spring) {
        squash = ending(time);
      } else if (lamp.root.visible) {
        squash = setEntrance(time).squash;
      }
      word.selected.scale.y = squash;
      word.selected.visible = squash > 0.002;
      return reveal;
    },
  };
}
