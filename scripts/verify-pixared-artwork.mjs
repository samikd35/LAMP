// Exercise the public TV with the same artwork people upload through the fold-down.
import assert from "node:assert/strict";
import { openBrowser } from "../server/worker.mjs";

const origin = process.env.PIXARED_URL ?? "http://127.0.0.1:4193";
const browser = await openBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await page.goto(origin);
  const dialog = page.getByRole("dialog");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const upload = async (file, label = "Upload a logo") => {
    const chooser = page.waitForEvent("filechooser");
    await button(label).click();
    await (await chooser).setFiles(file);
  };
  const playAndPause = async () => {
    await button("Play my preview").click();
    await button("Pause").click();
    await button("Resume").waitFor();
  };
  const canvas = page.getByLabel("Your film preview", { exact: true });
  const checkRatio = async (expected) => {
    const bounds = await canvas.boundingBox();
    assert.ok(bounds && bounds.width > 0 && Math.abs(bounds.width / bounds.height - expected) < 0.02,
      `Expected visible film with ratio ${expected}, got ${JSON.stringify(bounds)}`);
  };

  await dialog.getByLabel("Your name", { exact: true }).fill("Zoë");
  await upload("examples/logos/NOVA.svg");
  await dialog.getByText("NOVA.svg", { exact: true }).waitFor();
  assert.match(await dialog.textContent(), /4 selectable parts.*Vector artwork/);
  await page.waitForFunction(() => document.querySelector('[role="dialog"] img')?.naturalWidth > 0);
  await upload({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("Not artwork") });
  await button("Choose another file").waitFor();
  assert.match(await dialog.getByRole("alert").textContent(), /PNG|logo|SVG|image/i);
  assert.ok(await dialog.getByText("NOVA.svg", { exact: true }).isVisible());
  await playAndPause();
  await checkRatio(16 / 9);
  await button("Edit").click();
  await button("Film settings").click();
  const landing = dialog.getByRole("combobox", { name: "Landing", exact: true });
  assert.deepEqual(await landing.locator("option").allTextContents(), ["Automatic","Part 1","Part 2","Part 3","Part 4"]);
  await landing.selectOption("2");
  await button("Match colors to logo").click();
  await dialog.getByRole("combobox", { name: "Film shape", exact: true }).selectOption("square");
  await playAndPause();
  await checkRatio(1);
  await button("Edit").click();
  await button("Use a name").click();
  assert.equal(await dialog.getByLabel("Your name", { exact: true }).inputValue(), "Zoë");
  await button("Film settings").click();
  await dialog.getByRole("combobox", { name: "Name ending", exact: true }).selectOption("restore");
  await dialog.getByRole("combobox", { name: "Film shape", exact: true }).selectOption("portrait");
  await playAndPause();
  await checkRatio(9 / 16);
  await button("Edit").click();
  await button("Use saved logo").click();
  await button("Film settings").click();
  assert.equal(await landing.inputValue(), "2");
  assert.equal(await dialog.getByRole("combobox", { name: "Film shape", exact: true }).inputValue(), "square");
  assert.ok(await dialog.getByRole("combobox", { name: "Name ending", exact: true }).isHidden());
  await button("Edit artwork").click();
  await upload("examples/logos/Fold.png");
  await dialog.getByText("Fold.png", { exact: true }).waitFor();
  await playAndPause();
  await checkRatio(1);
  console.log("Pixared logo upload, recovery, settings, film framing and draft switching passed.");
} finally {
  await browser.close();
}
