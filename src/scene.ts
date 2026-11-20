import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeLamp } from "./lamp";
import { placeLamp, planLampClearance } from "./lamp-clearance";
import { makeText } from "./text";
import { makeLogo } from "./logo";
import { makeLogoPerformance } from "./logo-performance";
import { evaluate } from "./timeline.mjs";
import { snapshot, presets } from "./config.mjs";
export type Config = ReturnType<typeof snapshot>;
export function studioScene(canvas: HTMLCanvasElement, crt = false) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.VSMShadowMap;
  const scene = new T.Scene(),
    pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    env = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.46;
  scene.add(new T.HemisphereLight(0xfff8ed, 0x797b90, 0.94));
  const key = new T.DirectionalLight(0xffede0, 2.1);
  key.position.set(-3, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 1024);
  key.shadow.normalBias = 0.012;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 3.2;
  key.shadow.blurSamples = 6;
  scene.add(key, key.target);
  const floor = new T.Mesh(
    new T.PlaneGeometry(250, 250),
    new T.ShadowMaterial({ color: 0x353b56, opacity: 0.22 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wash = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      uniforms: { base: { value: new T.Color() } },
      vertexShader:
        "varying vec2 v; void main(){v=uv;gl_Position=vec4(position.xy,0.99999,1.);}",
      fragmentShader: `uniform vec3 base; varying vec2 v; void main(){float sky=smoothstep(.37,.99,v.y);float upper=smoothstep(.34,.57,v.y);float front=1.-smoothstep(.0,.46,v.y);vec3 col=base*(1.-.29*sky+upper*vec3(0.,.055,.19))+front*vec3(.036,-.029,-.078);gl_FragColor=vec4(max(vec3(0.),col),1.);\n#include <colorspace_fragment>\n}`,
      depthWrite: false,
      depthTest: false,
    }),
  );
  wash.frustumCulled = false;
  wash.renderOrder = -1000;
  scene.add(wash);
  const bars = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      uniforms: { matte: { value: 0 }, showMatte: { value: crt ? 0 : 1 }, fade: { value: 0 } },
      vertexShader: wash.material.vertexShader,
      fragmentShader:
        "varying vec2 v;uniform float matte;uniform float showMatte;uniform float fade;void main(){float a=(v.y<matte||v.y>1.-matte)?max(showMatte,fade):fade;if(a<.001)discard;gl_FragColor=vec4(0.,0.,0.,a);}",
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  bars.frustumCulled = false;
  bars.renderOrder = 100;
  scene.add(bars);
  const pool = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.ShaderMaterial({
      uniforms: { strength: { value: 0.6 } },
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform float strength;varying vec2 v;void main(){vec2 p=(v-.5)*2.;float d=dot(p,p);gl_FragColor=vec4(vec3(1.,.92,.76),strength*exp(-4.*d)*(1.-smoothstep(.64,1.,d)));\n#include <colorspace_fragment>\n}`,
      transparent: true,
      depthWrite: false,
    }),
  );
  pool.rotation.order = "YXZ";
  pool.rotation.x = -Math.PI / 2;
  scene.add(pool);
  const socket = new T.Vector3(),
    axis = new T.Vector3(),
    orientation = new T.Quaternion();
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(32,31,28,.48)");
  gradient.addColorStop(0.38, "rgba(42,38,32,.22)");
  gradient.addColorStop(1, "rgba(48,45,40,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const soft = new T.CanvasTexture(c);
  soft.colorSpace = T.SRGBColorSpace;
  function shadow() {
    const m = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: soft,
        transparent: true,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 160);
  let contents: T.Group,
    config: Config,
    lamp: ReturnType<typeof makeLamp>,
    logoPerformance: ReturnType<typeof makeLogoPerformance> | undefined,
    clearance: ReturnType<typeof planLampClearance> | undefined,
    word: ReturnType<typeof makeText> | ReturnType<typeof makeLogo>,
    blob: ReturnType<typeof shadow>,
    span = 1,
    ratio = 1,
    staging = {
      start: 0,
      approach: 0,
      target: 0,
      height: 0,
      baseline: 0,
      end: 0,
    };
  function clear() {
    if (!contents) return;
    scene.remove(contents);
    const materials = new Set<T.Material>();
    contents.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const m of [].concat(o.material)) materials.add(m);
      }
    });
    materials.forEach((m) => {
      if (m instanceof T.MeshBasicMaterial && m.map && m.map !== soft)
        m.map.dispose();
      m.dispose();
    });
  }
  function lightTitle(width: number) {
    const half = width / 2;
    key.position.set(-2.2, 8, 2.3).multiplyScalar(1 + half * 0.12);
    const sh = key.shadow.camera;
    sh.left = -half - 4;
    sh.right = half + 4;
    sh.top = 4.5 + half * 0.4;
    sh.bottom = -4 - half * 0.4;
    sh.far = 40 + half * 2;
    sh.updateProjectionMatrix();
  }
  function configure(cfg: Config) {
    clear();
    config = cfg;
    const [w, h] = presets[cfg.aspect as keyof typeof presets];
    ratio = w / h;
    scene.background = new T.Color(cfg.background);
    contents = new T.Group();
    scene.add(contents);
    wash.material.uniforms.base.value.set(cfg.background);
    wash.visible = bars.visible = pool.visible = !cfg.logo;
    lamp = makeLamp(cfg.lamp);
    clearance = undefined;
    logoPerformance = undefined;
    if (cfg.logo) {
      const logo = makeLogo(cfg.logo, cfg.target);
      word = logo;
      contents.add(logo.group, lamp.root);
      lightTitle(logo.width);
      logoPerformance = makeLogoPerformance(contents, logo, lamp, ratio, cfg.background);
      clearance = logoPerformance.clearance;
      draw(0);
      return;
    }
    word = makeText(cfg.name, cfg.target, cfg.text);
    floor.material.opacity = 0.22;
    lamp.root.scale.setScalar(word.lampScale);
    contents.add(word.group, lamp.root);
    word.group.updateMatrixWorld(true);
    blob = shadow();
    contents.add(blob);
    for (const letter of word.group.children) {
      const b = new T.Box3().setFromObject(letter),
        s = shadow();
      s.position.set((b.min.x + b.max.x) / 2, 0.003, 0.13);
      s.scale.set(b.max.x - b.min.x + 0.36, 0.85, 1);
      s.material.opacity = 0.62;
      contents.add(s);
    }
    const half = word.width / 2;
    // Locked title camera: reserve vertical room for the fifth strike, not
    // horizontal room for the offscreen start of the entrance.
    bars.material.uniforms.matte.value = ratio > 1.65 ? 0.127 : 0;
    span = Math.max(
      (word.width + 0.15) / (0.69 * ratio),
      (cfg.ending === "restore" ? word.width + 2.8 : word.width + 1.55) / ratio,
      7.75,
      (2.37 + 0.34 * (word.height + word.baseline) + 1.56 * word.lampScale) /
        (0.635 - bars.material.uniforms.matte.value - 0.009),
    );
    staging = {
      start:
        (span * ratio * 0.5 + 0.75 * word.lampScale - word.approachX * 0.22) /
        0.78,
      approach: word.approachX,
      target: word.targetX,
      height: word.height + word.baseline,
      baseline: word.baseline,
      end: half + 0.9,
    };
    const cx = cfg.ending === "restore" ? 0.58 : 0;
    const cameraOffset = 0.12;
    camera.position.set(cx + cameraOffset, 2.35, 20);
    camera.lookAt(cx, 0, 0.08);
    camera.updateMatrixWorld();
    // The entrance intentionally crosses the edge. Every pose after the stop,
    // including the optional dismount, must fit with the shade fully visible.
    const projected = new T.Vector3(),
      matrix = new T.Matrix4(),
      parts: T.Mesh[] = [];
    lamp.root.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.computeBoundingBox();
        parts.push(o);
      }
    });
    const sample = (progress: number) => evaluate(progress * cfg.duration, cfg.duration, staging, cfg.ending);
    const fitLamp = () => {
      for (let i = Math.ceil((93 / 24) * cfg.fps); i <= cfg.frameCount; i++) {
        const progress = i / cfg.frameCount;
        placeLamp(lamp, sample(progress), progress, clearance);
        lamp.root.updateMatrixWorld(true);
        for (const part of parts) {
          const b = part.geometry.boundingBox!;
          matrix.multiplyMatrices(camera.matrixWorldInverse, part.matrixWorld);
          for (const x of [b.min.x, b.max.x])
            for (const y of [b.min.y, b.max.y])
              for (const z of [b.min.z, b.max.z]) {
                projected.set(x, y, z).applyMatrix4(matrix);
                span = Math.max(
                  span,
                  (Math.abs(projected.x) * 2.12) / ratio,
                  projected.y / (0.633 - bars.material.uniforms.matte.value - 0.013),
                );
              }
        }
      }
    };
    fitLamp();
    staging.start =
      (cx +
        span * ratio * 0.5 +
        0.75 * word.lampScale -
        word.approachX * 0.22) /
      0.78;
    clearance = planLampClearance(lamp, word, camera.matrixWorldInverse, sample,
      cfg.frameCount * 2, word.lampScale, cfg.ending === "restore");
    if (clearance.tuck.length) fitLamp();
    const cy = span * 0.135;
    camera.position.set(cx + cameraOffset, cy + 2.35, 20);
    camera.lookAt(cx, cy, 0.08);
    lightTitle(word.width);
    draw(0);
  }
  function pose(t: number) {
    const p = evaluate(t, config.duration, staging, config.ending);
    bars.material.uniforms.fade.value =
      1 -
      Math.min(
        1,
        Math.max(0, (t - 0.24) / 0.73),
        config.ending === "replace"
          ? Math.max(0, (config.duration - t) / 1.15)
          : 1,
      );
    word.selected.scale.y = p.squash;
    word.selected.visible = p.squash > 0.002;
    placeLamp(lamp, p, T.MathUtils.clamp(t / config.duration, 0, 1), clearance);
    const { x, y, z } = lamp.root.position;
    blob.position.set(x, 0.005, z);
    blob.scale.set(1.03 + y * 0.5, 1.06 + y * 0.5, 1);
    blob.material.opacity = 0.91 / (1 + y * 2.6);
    lamp.shade.getWorldPosition(socket);
    lamp.shade.getWorldQuaternion(orientation);
    axis.set(0, -1, 0).applyQuaternion(orientation);
    const reach = Math.min(2.8, socket.y / Math.max(0.25, -axis.y));
    pool.position.set(
      socket.x + axis.x * reach,
      0.002,
      socket.z + axis.z * reach,
    );
    pool.rotation.y = Math.atan2(axis.x, axis.z);
    pool.scale.set(1.55 + reach * 0.92, 1.75 + reach * 1.13, 1);
    pool.material.uniforms.strength.value = 0.6 / (1 + y * 0.65);
  }
  let viewportRatio = 1;
  function draw(t: number) {
    if (logoPerformance) {
      floor.material.opacity = 0.21 * logoPerformance.pose(t);
      renderer.render(scene, logoPerformance.camera);
      return;
    }
    pose(t);
    camera.left = (-span * ratio) / 2;
    camera.right = -camera.left;
    camera.top = (span / 2) * (crt ? Math.max(1, ratio / viewportRatio) : 1);
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  function resize(w: number, h: number) {
    viewportRatio = w / h;
    renderer.setSize(w, h, false);
  }
  function pickTarget(x: number, y: number) {
    if (!word) return -1;
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(x, y), logoPerformance?.camera ?? camera);
    const hit = ray.intersectObjects(word.group.children.filter((part) => part.visible))[0];
    if (!hit) return -1;
    let part = hit.object;
    while (part.parent && part.parent !== word.group) part = part.parent;
    return logoPerformance ? word.group.children.indexOf(part) : (part.userData.letterIndex ?? -1);
  }
  return {
    configure,
    clearance: () => clearance && { before: clearance.originalScore, after: clearance.score, scale: clearance.scale },
    pickLogoPart(x: number, y: number) {
      return logoPerformance ? pickTarget(x, y) : -1;
    },
    pickTarget,
    draw,
    resize,
    warm: () => renderer.compileAsync(scene, logoPerformance?.camera ?? camera),
    dispose() {
      clear();
      soft.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      for (const mesh of [wash, bars, pool]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      env.dispose();
      renderer.dispose();
    },
  };
}
