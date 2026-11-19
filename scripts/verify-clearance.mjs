import assert from "node:assert/strict";
import { createServer } from "vite";
import { openBrowser } from "../server/worker.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await openBrowser();
  const page = await browser.newPage();
  await page.route(origin + "/clearance-test", (route) => route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }));
  await page.goto(origin + "/clearance-test");
  const { results, contacts, roofGaps } = await page.evaluate(async () => {
    const { studioScene } = await import("/src/scene.ts");
    const { snapshot } = await import("/src/config.mjs");
    const { placeLamp } = await import("/src/lamp-clearance.ts");
    const { strikes } = await import("/src/timeline.mjs");
    const { makeLogo } = await import("/src/logo.ts");
    const { makeLogoPerformance } = await import("/src/logo-performance.ts");
    const { makeLamp } = await import("/src/lamp.ts");
    const { Box3, Group } = await import("/node_modules/three/build/three.module.js");
    const bars = (heights) => {
      const width = 5 * heights.length;
      const rectangles = heights.map((h, i) =>
        '<rect x="' + (5 * i) + '" y="' + (100 - h) + '" width="4" height="' + h + '" fill="#1499ac"/>',
      );
      return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 100">' + rectangles.join("") + '</svg>' };
    };
    const root = { position: { set: (...xyz) => { root.xyz = xyz; } } };
    const contacts = strikes.map((frame) => {
      const pose = { x: 2, y: 0.7, z: 0.08, fold: 0.8, look: 5, yaw: 357, neck: 0, tilt: 0 };
      placeLamp({ root, pose() {} }, pose, frame / 312, {
        rear: 1.8, lift: 1.55, tuck: Float32Array.of(1, 1),
      });
      return root.xyz;
    });
    const canvas = document.querySelector("canvas"), studio = studioScene(canvas);
    studio.resize(640, 360);
    const cases = [
      { name: "pie", target: 1 },
      { name: "pie", target: 1, aspect: "portrait", ending: "restore" },
      { name: "piepiepiepiepiepiepiepie", target: 10 },
      { name: "PIXAR", target: 1 },
      { name: "Tight.svg", target: 6, logo: bars(Array.from({ length: 12 }, (_, i) => i === 6 ? 10 : 100)) },
      { name: "I", target: 0 },
    ];
    try {
      const results = cases.map((input) => {
        const t = 9.25;
        studio.configure(snapshot(input));
        studio.draw(t);
        const first = canvas.toDataURL();
        studio.draw(0);
        studio.draw(t);
        return { ...studio.clearance(), deterministic: canvas.toDataURL() === first };
      });
      const room = new Group(), lamp = makeLamp("#ded7c9"), logo = makeLogo(bars([100, 100, 100]), 1);
      room.add(lamp.root, logo.group);
      const performance = makeLogoPerformance(room, logo, lamp, 16 / 9, "#faf9f7");
      const roof = Math.max(...room.children.filter((o) => o.isMesh).map((o) => o.position.y));
      const roofGaps = [375, 376, 377, 378, 379, 380, 382].map((frame) => {
        performance.pose(frame / 30);
        room.updateMatrixWorld(true);
        return roof - new Box3().setFromObject(lamp.shade, true).max.y;
      });
      return { results, contacts, roofGaps };
    } finally {
      studio.dispose();
    }
  });
  console.log(results);
  for (const result of results) {
    assert.ok(result.after <= result.before * 0.02, "Tight layouts should lose nearly all measured overlap");
    assert.ok(result.deterministic, "Seeking must reconstruct the same adjusted pose");
  }
  assert.ok(results[0].before > 0, "The p/e fixture must reproduce a clearance problem");
  assert.equal(results[0].after, 0, "The p/e overlap should be removed");
  assert.ok(results[4].before > 0, "The short logo part fixture must reproduce a clearance problem");
  assert.equal(results.at(-1).before, 0, "A scene with no neighboring parts should keep its original performance");
  assert.deepEqual(contacts, Array.from({ length: 5 }, () => [2, 0.7, 0.08]), "All five stomp positions stay fixed");
  assert.ok(roofGaps.slice(0, 4).every((gap) => gap > 1e-5), "The shade stays below the roof before the crash cue");
  assert.ok(roofGaps.slice(4).every((gap) => Math.abs(gap) < 1e-5), "The shade contacts and compresses against the roof");
} finally {
  await browser?.close();
  await server.close();
}
