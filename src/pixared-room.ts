import "./pixared-room.css";

const art = "/pixared-room/";
const phoneQuery =
  "(max-width:500px), (max-width:650px) and (orientation:portrait)";

export function mountRoom(host: HTMLElement) {
  const element = document.createElement("section");
  element.className = "pixared-room";
  element.setAttribute("aria-label", "Pixared television");
  element.innerHTML = `<div class="px-scenery" aria-hidden="true"><div class="px-origin">
    <picture><source media="${phoneQuery}" srcset="${art}phone.webp"><img class="px-plate" src="${art}desktop.webp" alt="" fetchpriority="high"></picture>
    <canvas class="px-geometry"></canvas><div class="px-clock-mask"><i class="px-hand"></i></div>
  </div></div><div class="px-controls">
    <a class="px-source" href="https://github.com/samikd35/LAMP" target="_blank" rel="noopener noreferrer" aria-label="View Lamp Name Studio on GitHub, opens in a new tab" title="GitHub ↗"></a>
    <div class="px-screen"></div>
    <button class="px-dial px-landing" type="button" aria-label="Landing" title="Landing"></button>
    <button class="px-dial px-sound" type="button" aria-label="Sound" title="Sound"></button>
    <div class="px-fascia"></div><div class="px-panel"></div>
  </div>`;
  host.append(element);
  const get = <T extends HTMLElement>(selector: string) =>
    element.querySelector<T>(selector)!;
  const screen = get<HTMLDivElement>(".px-screen");
  const panel = get<HTMLDivElement>(".px-panel");
  const fascia = get<HTMLDivElement>(".px-fascia");
  const landing = get<HTMLButtonElement>(".px-landing");
  const sound = get<HTMLButtonElement>(".px-sound");
  const source = get<HTMLAnchorElement>(".px-source");
  const plate = get<HTMLImageElement>(".px-plate");
  let canvas = get<HTMLCanvasElement>(".px-geometry");
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const phone = matchMedia(phoneQuery);
  const events = new AbortController();
  const { signal } = events;
  let geometry: Awaited<ReturnType<typeof makeCabinet>> | undefined;
  let engaged = false;
  let geometrySource = "";
  let generation = 0;
  let open = true;
  let motion = !reduced.matches;
  let keyboardFrame = 0;
  const hand = get(".px-hand");
  hand.style.animationDelay = `-${new Date().getSeconds()}s`;
  function clock() {
    element.dataset.clock =
      motion && !document.hidden && !reduced.matches ? "running" : "paused";
    if (document.hidden) geometry?.stop();
  }
  function setOpen(value: boolean) {
    const changed = open !== value;
    open = value;
    element.dataset.open = String(value);
    panel.hidden = !value;
    fascia.hidden = value;
    for (const control of [source, landing, sound]) control.inert = value;
    if (changed) {
      geometry?.fold(value, reduced.matches);
      if (value && !reduced.matches)
        panel.animate(
          [
            { transform: "perspective(950px) rotateX(-77deg)" },
            { transform: "perspective(950px) rotateX(0)" },
          ],
          { duration: 235, easing: "ease-out" },
        );
      if (!value) element.style.paddingBottom = "";
    }
  }
  function setRoomMotion(value: boolean) {
    motion = value;
    clock();
  }
  async function startGeometry() {
    const source = plate.currentSrc;
    if (!source || geometrySource === source || signal.aborted) return;
    geometrySource = source;
    const turn = ++generation;
    geometry?.dispose();
    geometry = undefined;
    const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(replacement);
    canvas = replacement;
    try {
      await plate.decode();
      if (signal.aborted || turn !== generation) return;
      const next = await makeCabinet(replacement, plate, phone.matches);
      if (signal.aborted || turn !== generation) next.dispose();
      else geometry = next;
    } catch {
      /* The photographic cabinet remains usable if WebGL is unavailable. */
    }
  }
  function hydrate() {
    engaged = true;
    void startGeometry();
  }
  element.addEventListener("pointerdown", hydrate, { signal, capture: true });
  element.addEventListener("keydown", hydrate, { signal, capture: true });
  plate.addEventListener(
    "load",
    () => {
      if (engaged) void startGeometry();
    },
    { signal },
  );
  landing.addEventListener("click", () => geometry?.turn(0, reduced.matches), {
    signal,
  });
  sound.addEventListener("click", () => geometry?.turn(1, reduced.matches), {
    signal,
  });
  document.addEventListener("visibilitychange", clock, { signal });
  reduced.addEventListener("change", clock, { signal });
  const viewport = window.visualViewport;
  function fitKeyboard() {
    cancelAnimationFrame(keyboardFrame);
    keyboardFrame = requestAnimationFrame(() => {
      if (!viewport) return;
      const gap = Math.max(0, window.innerHeight - viewport.height);
      element.style.paddingBottom = `${14 + (open && phone.matches ? gap : 0)}px`;
      const focused = document.activeElement;
      if (
        !open ||
        !phone.matches ||
        gap < 70 ||
        !(focused instanceof HTMLInputElement) ||
        !panel.contains(focused)
      )
        return;
      const bounds = panel.getBoundingClientRect();
      const target =
        bounds.height + 16 <= viewport.height
          ? bounds
          : focused.getBoundingClientRect();
      const bottom = viewport.offsetTop + viewport.height - 8;
      if (target.bottom > bottom) window.scrollBy(0, target.bottom - bottom);
      else if (target.top < viewport.offsetTop + 8)
        window.scrollBy(0, target.top - viewport.offsetTop - 8);
    });
  }
  viewport?.addEventListener("resize", fitKeyboard, { signal });
  element.addEventListener("focusin", fitKeyboard, { signal });
  setOpen(true);
  clock();
  function dispose() {
    events.abort();
    cancelAnimationFrame(keyboardFrame);
    geometry?.dispose();
    element.remove();
  }
  return {
    screen,
    panel,
    fascia,
    landing,
    sound,
    setOpen,
    setRoomMotion,
    dispose,
  };
}

// Project the baked materials onto the orthographic cabinet. This preserves the
// approved grain, reflections and lighting while allowing the hinge and dials to turn.
async function makeCabinet(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  phone: boolean,
) {
  const T = await import("three");
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new T.Scene();
  const width = phone ? 514 : 888;
  const height = phone ? 393 : 636;
  const originX = phone ? 11 : 350;
  const originY = phone ? 278 : 188;
  const camera = new T.OrthographicCamera(
    0,
    width,
    width * 0.29,
    -width * 0.86,
    1,
    2600,
  );
  camera.position.z = 1500;
  const texture = new T.Texture(image);
  texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  const face = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.4,
    toneMapped: false,
  });
  const grain = new T.TextureLoader().load(art + "walnut.webp");
  grain.colorSpace = T.SRGBColorSpace;
  const wood = new T.MeshBasicMaterial({ map: grain, toneMapped: false });
  const pins = new T.MeshBasicMaterial({ color: 0xb49461 });
  const meshes: import("three").Mesh[] = [];
  function project(
    geometry: import("three").BufferGeometry,
    x: number,
    y: number,
    z: number,
  ) {
    const vertices = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < vertices.count; i++)
      uv.setXY(
        i,
        (originX + x + vertices.getX(i)) / image.naturalWidth,
        1 - (originY + y - vertices.getY(i)) / image.naturalHeight,
      );
    const mesh = new T.Mesh(geometry, face);
    mesh.position.set(x, -y, z);
    meshes.push(mesh);
    scene.add(mesh);
    return mesh;
  }
  const shape = new T.Shape();
  const radius = width * 0.024;
  shape.moveTo(radius, 0);
  shape.lineTo(width - radius, 0);
  shape.quadraticCurveTo(width, 0, width, -radius);
  shape.lineTo(width, -height + radius);
  shape.quadraticCurveTo(width, -height, width - radius, -height);
  shape.lineTo(radius, -height);
  shape.quadraticCurveTo(0, -height, 0, -height + radius);
  shape.lineTo(0, -radius);
  shape.quadraticCurveTo(0, 0, radius, 0);
  project(
    new T.ExtrudeGeometry(shape, {
      depth: width * 0.035,
      bevelEnabled: false,
      curveSegments: 5,
    }),
    0,
    0,
    0,
  );
  const dialX = width * (phone ? 0.903 : 0.9015);
  const dialRadius = width * (phone ? 0.053 : 0.047);
  const dials = (phone ? [0.14, 0.287] : [0.124, 0.263]).map((y) => {
    const geo = new T.CylinderGeometry(
      dialRadius,
      dialRadius,
      width * 0.025,
      40,
    );
    geo.rotateX(Math.PI / 2);
    return project(geo, dialX, width * y, width * 0.052);
  });
  // A shallow domed glass surface carries the baked curved lip outside the live picture.
  const glass = new T.PlaneGeometry(width * 0.704, width * 0.449, 16, 12);
  const pts = glass.getAttribute("position");
  for (let i = 0; i < pts.count; i++) {
    const nx = pts.getX(i) / (width * 0.352),
      ny = pts.getY(i) / (width * 0.2245);
    pts.setZ(
      i,
      width * 0.013 * Math.max(0, 1 - nx * nx) * Math.max(0, 1 - ny * ny),
    );
  }
  project(glass, width * 0.422, width * 0.322, width * 0.037);
  // Feet and aerial use the measured silhouette ends as pivots in the same projection.
  const rodEnds = phone
    ? [
        [151, 153, 232, 278],
        [378, 154, 296, 278],
      ]
    : [
        [602, 27, 737, 188],
        [985, 27, 851, 188],
      ];
  for (const [x1, y1, x2, y2] of rodEnds) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const rod = new T.CylinderGeometry(
      width * 0.002,
      width * 0.003,
      Math.hypot(dx, dy),
      8,
    );
    rod.rotateZ(Math.atan2(dx, dy));
    project(rod, (x1 + x2) / 2 - originX, (y1 + y2) / 2 - originY, 10);
  }
  // Render the two short, raked walnut legs behind the cabinet's lower lip.
  for (const side of [-1, 1]) {
    const foot = new T.CylinderGeometry(
      width * 0.026,
      width * 0.012,
      width * 0.07,
      10,
    );
    foot.rotateZ(-side * 0.54);
    project(foot, width * (0.5 + side * 0.418), height + width * 0.029, 0);
  }
  const hinge = new T.Group();
  hinge.position.set(
    width * 0.5,
    -width * (phone ? 0.635 : 0.593),
    width * 0.057,
  );
  const door = new T.Mesh(
    new T.BoxGeometry(
      width * (phone ? 0.86 : 0.84),
      width * 0.213,
      width * 0.011,
    ),
    wood,
  );
  door.position.y = -width * 0.1065;
  hinge.add(door);
  for (const offset of [-0.32, 0.32]) {
    const cylinder = new T.Mesh(
      new T.CylinderGeometry(width * 0.005, width * 0.005, width * 0.049, 10),
      pins,
    );
    cylinder.rotation.z = Math.PI / 2;
    cylinder.position.x = offset * width;
    hinge.add(cylinder);
    meshes.push(cylinder);
  }
  meshes.push(door);
  scene.add(hinge);
  hinge.visible = false;
  const draw = () => renderer.render(scene, camera);
  const resize = new ResizeObserver(() => {
    renderer.setSize(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
      false,
    );
    draw();
  });
  resize.observe(canvas);
  let frame = 0;
  function stop() {
    cancelAnimationFrame(frame);
    hinge.visible = false;
    draw();
  }
  function fold(isOpen: boolean, instant: boolean) {
    cancelAnimationFrame(frame);
    hinge.visible = !instant;
    if (instant) {
      draw();
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / 235);
      const amount = isOpen ? t : 1 - t;
      hinge.rotation.x = -(1 - amount) * Math.PI * 0.49;
      hinge.visible = t < 1;
      draw();
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function turn(index: number, instant: boolean) {
    if (!instant)
      dials[index].rotation.z = dials[index].rotation.z === 0 ? -0.13 : 0;
    draw();
  }
  draw();
  return {
    stop,
    fold,
    turn,
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      meshes.forEach((mesh) => mesh.geometry.dispose());
      texture.dispose();
      grain.dispose();
      face.dispose();
      wood.dispose();
      pins.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
