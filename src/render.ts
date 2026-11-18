import { studioScene, type Config } from "./scene";
import { presets, snapshot } from "./config.mjs";
const canvas = document.querySelector("canvas")!;
let studio: ReturnType<typeof studioScene>;
Object.assign(window, {
  async prepare(config: Config) {
    studio = studioScene(canvas);
    const [w, h] = presets[config.aspect as keyof typeof presets];
    studio.resize(w, h);
    studio.configure(snapshot(config));
    await studio.warm();
    studio.draw(0);
  },
  frame(t: number) {
    studio.draw(t);
    return canvas.toDataURL("image/jpeg", 0.978).split(",")[1];
  },
});
