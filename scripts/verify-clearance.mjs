import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  const { results, contacts } = await page.evaluate(async (svg) => {
    const { studioScene } = await import("/src/scene.ts");
    const { snapshot } = await import("/src/config.mjs");
    const { placeLamp } = await import("/src/lamp-clearance.ts");
    const { strikes } = await import("/src/timeline.mjs");
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
      { name: "NOVA.svg", target: 1, ending: "restore", logo: { svg } },
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
      return { results, contacts };
    } finally {
      studio.dispose();
    }
  }, await readFile("examples/logos/NOVA.svg", "utf8"));
  console.log(results);
  for (const result of results) {
    assert.ok(result.after <= result.before * 0.02, "Tight layouts should lose nearly all measured overlap");
    assert.ok(result.deterministic, "Seeking must reconstruct the same adjusted pose");
  }
  assert.ok(results[0].before > 0, "The p/e fixture must reproduce a clearance problem");
  assert.equal(results[0].after, 0, "The p/e overlap should be removed");
  assert.equal(results.at(-1).before, 0, "A scene with no neighboring parts should keep its original performance");
  assert.deepEqual(contacts, Array.from({ length: 5 }, () => [2, 0.7, 0.08]), "All five stomp positions stay fixed");
} finally {
  await browser?.close();
  await server.close();
}
