import { studioScene, type Config } from "./scene";
import { presets, snapshot } from "./config.mjs";
const canvas = document.querySelector("canvas")!;
let studio: ReturnType<typeof studioScene>;
let imageType: "image/jpeg" | "image/png";
Object.assign(window, {
  async prepare(input: Config) {
    const config = snapshot(input);
    studio = studioScene(canvas);
    const [w, h] = presets[config.aspect as keyof typeof presets];
    const scale = config.logo ? 2 : 1;
    imageType = config.logo ? "image/png" : "image/jpeg";
    studio.resize(w * scale, h * scale);
    studio.configure(config);
    await studio.warm();
    studio.draw(0);
  },
  frame(t: number) {
    studio.draw(t);
    return canvas.toDataURL(imageType, 0.978).split(",")[1];
  },
});
