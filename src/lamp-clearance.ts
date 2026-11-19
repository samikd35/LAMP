import * as T from "three";
import type { makeLamp } from "./lamp";
import type { evaluate } from "./timeline.mjs";

type Pose = ReturnType<typeof evaluate>;
type Lamp = ReturnType<typeof makeLamp>;
type Parts = { group: T.Group; selected: T.Object3D };
type Profile = { scale: number; rear: number; lift: number };
type Plan = Profile & { tuck: Float32Array; score: number; originalScore: number; endProgress: number };
const { lerp, smoothstep } = T.MathUtils;
const overlap = (a: T.Box3, b: T.Box3, axis: "x" | "y" | "z") =>
  Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);

export function placeLamp(lamp: Lamp, p: Pose, progress: number, plan?: Plan, amount?: number) {
  const frame = progress * 312;
  const index = Math.min(1, progress / (plan?.endProgress ?? 1)) * ((plan?.tuck.length ?? 1) - 1);
  const tuck = amount ?? (plan?.tuck.length
    ? lerp(plan.tuck[Math.floor(index)], plan.tuck[Math.ceil(index)], index % 1) : 0);
  const rear = (plan?.rear ?? 0) * smoothstep(frame, 0, 14) * (1 - smoothstep(frame, 133.3, 145));
  const u = T.MathUtils.clamp((frame - 257) / 17, 0, 1);
  const arc = 4 * u * (1 - u), lift = (plan?.lift ?? 0) * arc;
  // Rotate the links towards the back of the stage, and aim the shade down.
  // Neither adjustment translates the foot or changes the stomp timing.
  const turn = (270 - p.yaw + 540) % 360 - 180;
  const pose = {
    x: p.x,
    y: p.y + lift,
    z: p.z - rear - (plan?.lift ? plan.rear * arc : 0),
    squash: p.squash,
    fold: lerp(p.fold, 0.2, tuck),
    look: lerp(p.look, 66, tuck),
    yaw: p.yaw + turn * tuck,
    neck: p.neck * (1 - tuck),
    tilt: p.tilt * (1 - 0.55 * tuck),
  };
  lamp.root.position.set(pose.x, pose.y, pose.z);
  lamp.pose(pose.fold, pose.look, pose.yaw, pose.neck, pose.tilt);
  return pose;
}

export function planLampClearance(
  lamp: Lamp, word: Parts, view: T.Matrix4 | null, sample: (progress: number) => Pose,
  sampleCount: number, baseScale: number, restore: boolean, endProgress = 1,
): Plan {
  const idle = { scale: baseScale, rear: 0, lift: 0, tuck: new Float32Array(), score: 0, originalScore: 0, endProgress };
  const letters = word.group.children.filter((part) => part !== word.selected).map((part) => {
    const world = new T.Box3().setFromObject(part);
    return { world, screen: view && world.clone().applyMatrix4(view) };
  });
  if (!letters.length) return idle;
  const meshes: T.Mesh[] = [];
  lamp.root.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.geometry.computeBoundingBox();
      meshes.push(object);
    }
  });
  const world = new T.Box3(), screen = new T.Box3(), matrix = new T.Matrix4();
  const probe = (p: Pose, progress: number, plan: Plan, tuck?: number) => {
    placeLamp(lamp, p, progress, plan, tuck);
    // Broad phase in X; the lamp has no geometry farther than 2.1 rig units
    // from its root. Most entrance frames never reach a neighboring letter.
    const x = lamp.root.position.x, reach = 2.1 * plan.scale;
    const nearby = letters.filter(({ world }) => x + reach > world.min.x && x - reach < world.max.x);
    if (!nearby.length) return 0;
    lamp.root.updateMatrixWorld(true);
    let score = 0;
    for (const mesh of meshes) {
      const local = mesh.geometry.boundingBox!;
      world.copy(local).applyMatrix4(mesh.matrixWorld);
      for (const letter of nearby) {
        const px = overlap(world, letter.world, "x"), py = overlap(world, letter.world, "y");
        if (world.max.z > letter.world.min.z && overlap(world, letter.world, "z") > 0.025)
          score = Math.max(score, Math.max(0, px - 0.025) * Math.max(0, py - 0.025));
        // Camera-facing overlap matters even when the meshes are far apart in Z.
        // Behind the front face the letter hides the lamp, not the other way around.
        if (!view || !letter.screen || world.max.z < letter.world.max.z - 0.035 || px < -0.04 || py < -0.36) continue;
        matrix.multiplyMatrices(view, mesh.matrixWorld);
        screen.copy(local).applyMatrix4(matrix);
        const sx = overlap(screen, letter.screen, "x"), sy = overlap(screen, letter.screen, "y");
        score = Math.max(score, Math.max(0, sx - 0.035) * Math.max(0, sy - 0.035));
      }
    }
    return score;
  };

  const at = (i: number) => (i * endProgress) / sampleCount;
  const poses = Array.from({ length: sampleCount + 1 }, (_, i) => sample(at(i)));
  const measure = (plan: Plan) => poses.reduce((sum, p, i) => sum + probe(p, at(i), plan), 0);
  idle.score = idle.originalScore = measure(idle);
  if (idle.score === 0) return idle;
  let best = idle;
  const sizes = view ? [1, 0.88, 0.74, 0.60] : [1, 0.88, 0.74, 0.60, 0.48, 0.36];
  const profiles: Profile[] = [
    { scale: baseScale, rear: 0, lift: 0 },
    { scale: baseScale, rear: 0.9, lift: restore ? 0.9 : 0 },
    ...sizes.map((size) => ({ scale: baseScale * size, rear: 1.8, lift: restore ? 1.55 : 0 })),
  ];
  for (const profile of profiles) {
    const plan = { ...profile, tuck: new Float32Array(poses.length), score: 0, originalScore: idle.score, endProgress };
    lamp.root.scale.setScalar(plan.scale);
    for (const [i, p] of poses.entries()) {
      const progress = at(i);
      let least = probe(p, progress, plan, 0);
      if (least === 0) continue;
      for (const amount of [0.25, 0.5, 0.75, 1]) {
        const score = probe(p, progress, plan, amount);
        if (score < least) {
          least = score;
          plan.tuck[i] = amount;
        }
        if (score === 0) break;
      }
    }
    // Widen the adjustment around threatened frames so the rig eases into it.
    const raw = plan.tuck.slice(), radius = Math.ceil(sampleCount / 90);
    for (const [i, amount] of raw.entries()) if (amount > 0)
      for (let j = Math.max(0, i - radius); j <= Math.min(sampleCount, i + radius); j++)
        plan.tuck[j] = Math.max(plan.tuck[j], amount * (1 - smoothstep(Math.abs(i - j), 0, radius)));
    plan.score = measure(plan);
    if (plan.score < best.score) best = plan;
    if (plan.score === 0) break;
  }
  lamp.root.scale.setScalar(best.scale);
  return best;
}
