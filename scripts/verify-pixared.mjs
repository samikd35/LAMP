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
  const pin = dialog.getByRole("link", { name: /on GitHub/ });
  const repository = "https://github.com/samikd35/LAMP";
  assert.equal(await pin.getAttribute("href"), repository);
  await page.context().route(repository, route => route.fulfill({ body: "Repository" }));
  const opened = page.waitForEvent("popup");
  await pin.click();
  const repoTab = await opened;
  await repoTab.waitForURL(repository);
  await repoTab.close();
  assert.equal(await pin.evaluate(el => getComputedStyle(el, "::after").animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".px-source"), "::after").animationPlayState === "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  async function assertUnderGlass(selector) {
    const glass = await page.locator(".px-screen").boundingBox();
    const flap = await page.locator(selector).boundingBox();
    assert.ok(flap.width < glass.width);
    assert.ok(Math.abs(flap.x + flap.width / 2 - glass.x - glass.width / 2) < 1);
  }
  for (const [label, width, height] of [
    ["desktop", 1280, 800],
    ["phone", 360, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await settleRoom();
    await assertUnderGlass(".px-panel");
    await page.screenshot({ path: `outputs/pixared/${label}-first-visit.png` });
    assert(
      await dialog.getByRole("heading", { name: "Your name" }).isVisible(),
    );
  }
  for (const [width, height] of [[320, 568], [390, 620], [430, 640], [600, 700]]) {
    await page.setViewportSize({ width, height });
    await settleRoom();
    const plate = await page.locator(".px-plate").boundingBox();
    // The pennant starts below the blank top margin of the 539px-wide plate.
    assert.ok(plate.y + plate.width * 40 / 539 >= 8, `Mobile pennant clipped at ${width}×${height}`);
  }
  await page.setViewportSize({ width: 360, height: 640 });
  await settleRoom();
  // Focusing the field hydrates the cabinet. Its photographed tuner must stay visible.
  const tuner = page.locator(".px-landing");
  const beforeFocus = await tuner.screenshot();
  await dialog.getByLabel("Your name", { exact: true }).click();
  await page.waitForLoadState("networkidle");
  assert.ok(beforeFocus.equals(await tuner.screenshot()), "Cabinet darkened on focus");
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
    await assertUnderGlass(".px-fascia");
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
  const loading = slow.waitForRequest((req) => req.resourceType() === "script", { timeout: 10000 });
  const release = Promise.withResolvers();
  await slow.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") {
      await release.promise;
    }
    await route.continue();
  });
  await input.fill("Sam");
  await loading;
  await form.getByRole("button", { name: "Play my preview" }).click();
  await input.fill("Ada");
  release.resolve();
  await slow.waitForLoadState("networkidle");
  assert(await form.isVisible());
  assert.equal(await input.inputValue(), "Ada");
  const screen = slow.getByLabel("Your film preview", { exact: true });
  await screen.waitFor();
  const picture = await screen.boundingBox();
  const glass = await slow.locator(".px-screen").boundingBox();
  assert.ok(Math.abs(picture.height - glass.height) < 1 && Math.abs(picture.width - glass.width) < 1);
  const ada = await screen.screenshot();
  await input.fill("Luna");
  await slow.waitForTimeout(100);
  assert.ok(!ada.equals(await screen.screenshot()), "Typing changes the film before Play");
  await input.fill("");
  await screen.waitFor({ state: "hidden" });
  await input.fill("Ada");
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
