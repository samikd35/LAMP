// Run against a built Pixared service with the same browser used for film exports.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { openBrowser } from "../server/worker.mjs";

const origin = process.env.PIXARED_URL ?? "http://127.0.0.1:4193";
const browser = await openBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 360, height: 640 },
    reducedMotion: "reduce",
  });
  await page.goto(origin);
  assert.equal(await page.title(), "Pixared");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert(
    await dialog.getByRole("button", { name: "Upload a logo" }).isVisible(),
  );
  await mkdir("outputs/pixared", { recursive: true });
  async function settleRoom() {
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images]
          .filter((image) => image.currentSrc)
          .map((img) => img.decode().catch(() => {})),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
  }
  for (const [label, width, height] of [
    ["desktop", 1280, 800],
    ["phone", 360, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await settleRoom();
    await page.screenshot({ path: `outputs/pixared/${label}-first-visit.png` });
    assert(
      await dialog.getByRole("heading", { name: "Your name" }).isVisible(),
    );
  }
  await page.setViewportSize({ width: 360, height: 360 });
  const upload = dialog.getByRole("button", { name: "Upload a logo" });
  await upload.scrollIntoViewIfNeeded();
  const rect = await upload.boundingBox();
  assert(
    rect &&
      rect.y + rect.height <= 361 &&
      rect.width >= 44 &&
      rect.height >= 44,
  );
  await page.setViewportSize({ width: 360, height: 640 });
  const jobs = () =>
    page.request.get(origin + "/api/jobs").then((r) => r.json());
  const count = (await jobs()).length;
  await dialog.getByLabel("Your name", { exact: true }).fill("Sam");
  await dialog.getByRole("button", { name: "Play my preview" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  assert.equal((await jobs()).length, count);
  for (const [label, width, height] of [
    ["phone", 360, 640],
    ["desktop", 1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await settleRoom();
    await page.screenshot({ path: `outputs/pixared/${label}-playback.png` });
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(
    await dialog.getByLabel("Your name", { exact: true }).inputValue(),
    "Sam",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Edit",
  );
  const slow = await browser.newPage();
  await slow.goto(origin);
  const form = slow.getByRole("dialog");
  const input = form.getByRole("textbox", { name: "Your name" });
  await input.fill("Sam");
  const loading = slow.waitForRequest((req) => req.resourceType() === "script", { timeout: 10000 });
  const release = Promise.withResolvers();
  await slow.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") {
      await release.promise;
    }
    await route.continue();
  });
  await form.getByRole("button", { name: "Play my preview" }).click();
  await loading;
  await input.fill("Ada");
  release.resolve();
  await slow.waitForLoadState("networkidle");
  assert(await form.isVisible());
  assert.equal(await input.inputValue(), "Ada");
  await form.getByRole("button", { name: "Play my preview" }).click();
  await slow.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await slow.close();
  await page.goto(origin + "/studio.html");
  assert.equal(await page.title(), "Lamp Name Studio");
  console.log(
    "Pixared entry, name preview, draft, keyboard focus and Studio entry passed.",
  );
} finally {
  await browser.close();
}
