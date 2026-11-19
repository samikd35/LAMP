import * as T from "three";

export function makeLamp(color: string) {
  const root = new T.Group(),
    shoulder = new T.Group(),
    elbow = new T.Group(),
    head = new T.Group(),
    shade = new T.Group();
  const mat = (c: string, metalness: number, roughness: number) =>
    new T.MeshStandardMaterial({ color: c, metalness, roughness });
  const paint = mat(color, 0.32, 0.29),
    edge = mat("#68646b", 0.62, 0.3),
    steel = mat("#343936", 0.65, 0.31),
    brass = mat("#77716a", 0.55, 0.3),
    inside = mat("#ffead0", 0.12, 0.52);
  inside.emissive.set("#ffebad");
  inside.emissiveIntensity = 0.37;
  function mesh(
    p: T.Object3D,
    g: T.BufferGeometry,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  function lathe(p: T.Object3D, profile: number[][], m: T.Material) {
    return mesh(
      p,
      new T.LatheGeometry(
        profile.map(([r, y]) => new T.Vector2(r, y)),
        48,
      ),
      m,
    );
  }
  function axle(p: T.Group, r: number, l: number, m: T.Material, z = 0) {
    const o = mesh(p, new T.CylinderGeometry(r, r, l, 28), m, 0, 0, z);
    o.rotation.x = Math.PI / 2;
  }
  function joint(p: T.Group, r: number) {
    axle(p, r, 0.29, edge);
    for (const d of [-1, 1]) {
      axle(p, r * 0.82, 0.025, paint, d * 0.154);
      axle(p, r * 0.36, 0.032, brass, d * 0.174);
      const s = mesh(
        p,
        new T.BoxGeometry(r * 0.47, 0.009, 0.007),
        steel,
        0,
        0,
        d * 0.192,
      );
      s.rotation.z = 0.63;
    }
  }
  function bar(p: T.Group, length: number, x: number, z: number, w: number) {
    mesh(p, new T.BoxGeometry(w, length, 0.036), edge, x, length / 2, z);
  }
  function spring(p: T.Group, x: number, z: number, y: number, len: number) {
    const pts = [];
    for (let i = 0; i <= 104; i++) {
      const a = (i / 104) * 2 * Math.PI * 13;
      pts.push(
        new T.Vector3(
          x + 0.037 * Math.cos(a),
          y + (len * i) / 104,
          z + 0.037 * Math.sin(a),
        ),
      );
    }
    return mesh(
      p,
      new T.TubeGeometry(new T.CatmullRomCurve3(pts), 104, 0.009, 5, false),
      steel,
    );
  }
  const base = new T.Group();
  root.add(base);
  base.scale.set(1.18, 0.81, 1.18);
  lathe(
    base,
    [
      [0, 0.003],
      [0.34, 0.003],
      [0.359, 0.018],
      [0.36, 0.047],
      [0.35, 0.057],
      [0, 0.058],
    ],
    steel,
  );
  lathe(
    base,
    [
      [0, 0.044],
      [0.354, 0.044],
      [0.36, 0.058],
      [0.345, 0.08],
      [0.295, 0.108],
      [0.21, 0.138],
      [0.115, 0.157],
      [0.1, 0.19],
      [0.086, 0.21],
      [0, 0.21],
    ],
    paint,
  );
  mesh(root, new T.CylinderGeometry(0.058, 0.071, 0.14, 24), brass, 0, 0.21);
  root.add(shoulder);
  shoulder.position.y = 0.275;
  joint(shoulder, 0.075);
  for (const z of [-0.105, 0.105]) {
    bar(shoulder, 0.59, -0.015, z, 0.047);
    bar(shoulder, 0.51, 0.225, z, 0.036);
    mesh(
      shoulder,
      new T.BoxGeometry(0.28, 0.054, 0.043),
      edge,
      0.105,
      0.015,
      z,
    );
    const link = mesh(
      shoulder,
      new T.BoxGeometry(0.265, 0.049, 0.043),
      edge,
      0.105,
      0.55,
      z,
    );
    link.rotation.z = -0.34;
  }
  shoulder.add(elbow);
  elbow.position.y = 0.59;
  joint(elbow, 0.071);
  for (const z of [-0.104, 0.104]) {
    bar(elbow, 1.03, 0, z, 0.046);
    const tie = mesh(
      elbow,
      new T.BoxGeometry(0.026, 0.96, 0.029),
      edge,
      0.135,
      0.48,
      z,
    );
    tie.rotation.z = 0.12;
    mesh(elbow, new T.BoxGeometry(0.235, 0.05, 0.039), edge, 0.095, 0.018, z);
    mesh(elbow, new T.BoxGeometry(0.11, 0.049, 0.039), edge, 0.035, 0.967, z);
  }
  // Two tension springs bridge different moving links; their eye-to-eye
  // distance changes as the elbow folds, rather than rotating a rigid coil.
  const coils = [-0.075, 0.075].map((z) => spring(shoulder, 0.19, z, 0.055, 1));
  const endpoint = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  elbow.add(head);
  head.position.y = 1.03;
  joint(head, 0.066);
  head.add(shade);
  // The rolled lip joins two independent profiles, leaving an open, lit interior.
  shade.scale.set(1.26, 1.39, 1.26);
  const profile = [
    [0.083, -0.017],
    [0.101, -0.056],
    [0.112, -0.098],
    [0.15, -0.143],
    [0.203, -0.206],
    [0.247, -0.278],
    [0.272, -0.352],
    [0.282, -0.411],
  ];
  paint.side = T.DoubleSide;
  inside.side = T.DoubleSide;
  lathe(shade, profile, paint);
  lathe(
    shade,
    profile.map(([r, y]) => [r - 0.009, y - 0.002]),
    inside,
  );
  const rim = mesh(
    shade,
    new T.TorusGeometry(0.278, 0.012, 10, 48),
    paint,
    0,
    -0.412,
  );
  rim.rotation.x = Math.PI / 2;
  mesh(shade, new T.CylinderGeometry(0.074, 0.083, 0.11, 24), edge, 0, 0.017);
  mesh(shade, new T.CylinderGeometry(0.038, 0.047, 0.055, 16), brass, 0, 0.1);
  const bulbMaterial = new T.MeshStandardMaterial({
    color: "#fff2cb",
    emissive: "#ffd88c",
    emissiveIntensity: 0.46,
    roughness: 0.35,
  });
  const bulb = mesh(
    shade,
    new T.SphereGeometry(0.105, 24, 16),
    bulbMaterial,
    0,
    -0.294,
  );
  bulb.scale.y = 1.18;
  const beam = new T.SpotLight(0xffefcc, 7, 6, Math.PI * 0.26, 0.58, 2);
  beam.position.y = -0.414;
  beam.target.position.y = -1.42;
  shade.add(beam, beam.target);
  // A diagonal tie and vent slots keep the side and rear silhouettes distinct.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const vent = mesh(
      shade,
      new T.BoxGeometry(0.014, 0.06, 0.009),
      steel,
      0.106 * Math.sin(a),
      -0.073,
      0.106 * Math.cos(a),
    );
    vent.rotation.y = a;
  }
  const rad = T.MathUtils.degToRad;
  function pose(
    fold: number,
    look: number,
    yaw: number,
    neck: number,
    tilt: number,
  ) {
    root.rotation.order = "YXZ";
    root.rotation.y = rad(-yaw);
    root.rotation.z = rad(tilt);
    shoulder.rotation.z = rad(34 + fold * 34);
    const upper = -51 - fold * 24;
    elbow.rotation.z = rad(upper) - shoulder.rotation.z;
    elbow.updateMatrix();
    for (const coil of coils) {
      endpoint
        .set(0.19, 0.02, coil.position.z)
        .applyMatrix4(elbow.matrix)
        .sub(coil.position);
      coil.scale.y = endpoint.length();
      coil.quaternion.setFromUnitVectors(up, endpoint.normalize());
    }
    head.rotation.z = -rad(upper);
    shade.rotation.order = "YXZ";
    shade.rotation.y = rad(-neck);
    shade.rotation.z = rad(68 - look);
  }
  return { root, pose, shade, rim, bulbMaterial, beam };
}
