import { analyze, defaults, logoBackdrop, presets, snapshot } from "./config.mjs";
import { ceilingClatterUrl, sampleRate, soundtrack } from "./foley.mjs";
import type { Logo } from "./logo";
import type { Config, studioScene } from "./scene";

export type FilmMode = "name" | "logo";
export type TargetOption = { value: number; label: string };
export type PreparedLogo = {
  name: string;
  asset: Logo;
  thumbnail: string;
  description: string;
  targets: TargetOption[];
  auto: number;
  lamp: string;
  background: string;
};
export type FilmDraft = {
  mode: FilmMode;
  name: string;
  aspect: keyof typeof presets;
  lamp: string;
  text: string;
  background: string;
  ending: "restore" | "replace";
  target?: number;
  art?: PreparedLogo;
};

export function createDraft(mode: FilmMode): FilmDraft {
  return {
    mode, name: "", aspect: "landscape", lamp: defaults.lamp, text: defaults.text,
    background: mode === "logo" ? logoBackdrop : defaults.background,
    ending: mode === "logo" ? "restore" : "replace",
  };
}

export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const { automaticLogoTarget, importLogo, inspectLogo, logoImportSummary } = await import("./logo");
  const { asset, backgroundRemoved } = await importLogo(file);
  const { parts, lamp, background } = inspectLogo(asset);
  const thumbnail = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Could not read the logo. Choose another file."));
    reader.readAsDataURL(file);
  });
  return {
    name: file.name.slice(0, 100), asset, thumbnail, lamp, background,
    description: logoImportSummary(asset, parts.length, backgroundRemoved),
    auto: automaticLogoTarget(parts),
    targets: parts.map((_, i) => ({ value: i, label: `Part ${i + 1}` })),
  };
}

export function targetOptions(draft: FilmDraft): TargetOption[] {
  if (draft.mode === "logo") return draft.art?.targets ?? [];
  try {
    const { chars, eligible } = analyze(draft.name);
    return eligible.map((i) => ({ value: i, label: `${chars[i]} · position ${i + 1}` }));
  } catch {
    return [];
  }
}

export function draftConfig(draft: FilmDraft): Config {
  const { aspect, lamp, text, background, ending, target } = draft;
  const settings = { aspect, lamp, text, background, ending, target };
  if (draft.mode === "name") {
    if (!draft.name.trim()) throw Error("Enter your name.");
    return snapshot({ ...settings, name: draft.name });
  }
  const { art } = draft;
  if (!art) throw Error("Choose a logo first.");
  if (target !== undefined && !art.targets.some((option) => option.value === target))
    throw Error("Choose a part in this logo.");
  return snapshot({ ...settings, name: art.name, logo: art.asset, target: target ?? art.auto });
}

export type PlaybackState = "playing" | "paused" | "ended";

export function createFilm(
  canvas: HTMLCanvasElement,
  onState: (state: PlaybackState) => void,
  onError: (message: string) => void,
) {
  let scene: ReturnType<typeof studioScene> | undefined;
  let config: Config | undefined;
  let configured: Config | undefined;
  let state: PlaybackState = "paused";
  let revision = 0;
  let frameRequest = 0;
  let time = 0;
  let start = 0;
  let drawnFrame = -1;
  let disposed = false;

  let sound = false;
  let context: AudioContext | undefined;
  let audio: AudioBufferSourceNode | undefined;
  let buffer: AudioBuffer | undefined;
  let bufferKey = "";
  let audioRevision = 0;
  let clatter: Promise<Uint8Array> | undefined;

  function stopAudio() {
    audioRevision++;
    audio?.stop();
    audio?.disconnect();
    audio = undefined;
  }

  function clock() {
    return state === "playing" && config
      ? Math.min(config.duration, (performance.now() - start) / 1000)
      : time;
  }

  function startAudio() {
    if (!sound || state !== "playing" || !config) return;
    const current = config;
    const order = ++audioRevision;
    async function attach() {
      context ??= new AudioContext();
      await context.resume();
      if (order !== audioRevision) return;
      const key = JSON.stringify([current.name, current.target, current.ending, current.frameCount, current.seed]);
      if (!buffer || key !== bufferKey) {
        if (current.logo && !clatter) {
          clatter = fetch(ceilingClatterUrl).then(async (response) => {
            if (!response.ok) throw Error("Could not load logo audio.");
            return new Uint8Array(await response.arrayBuffer());
          }).catch((error: unknown) => { clatter = undefined; throw error; });
        }
        const clip = current.logo ? await clatter : undefined;
        if (order !== audioRevision) return;
        const [left, right] = soundtrack(current, clip);
        buffer = context.createBuffer(2, left.length, sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        bufferKey = key;
      }
      const at = clock();
      if (at >= current.duration) return;
      audio = context.createBufferSource();
      audio.buffer = buffer;
      audio.connect(context.destination);
      audio.start(0, at);
    }
    void attach().catch(() => {
      if (order === audioRevision) onError("Preview sound is unavailable. The film will continue playing.");
    });
  }

  function pause() {
    time = clock();
    revision++;
    cancelAnimationFrame(frameRequest);
    stopAudio();
    state = "paused";
    onState(state);
  }

  function resize() {
    if (!scene || !configured) return;
    const { width } = canvas.getBoundingClientRect();
    if (!width) return;
    const [w, h] = presets[configured.aspect as keyof typeof presets];
    const pixels = Math.max(1, Math.min(w, Math.round(width * Math.min(devicePixelRatio, 2))));
    scene.resize(pixels, Math.max(1, Math.round(pixels * h / w)));
    scene.draw(configured === config ? time : 4.25);
  }

  function tick() {
    if (!scene || !config || state !== "playing") return;
    time = clock();
    const frame = Math.floor(time * config.fps);
    if (frame !== drawnFrame) {
      scene.draw(time);
      drawnFrame = frame;
    }
    if (time >= config.duration) {
      state = "ended";
      stopAudio();
      onState(state);
    } else {
      frameRequest = requestAnimationFrame(tick);
    }
  }

  async function startFrom(next: Config, at: number) {
    if (disposed) return;
    const order = ++revision;
    cancelAnimationFrame(frameRequest);
    stopAudio();
    time = clock();
    state = "paused";
    // Resume on the user's gesture while the scene module is loading.
    if (sound) {
      try {
        context ??= new AudioContext();
        void context.resume().catch(() => {});
      } catch { /* startAudio reports unavailable output. */ }
    }
    const { studioScene } = await import("./scene");
    if (order !== revision) return;
    config = next;
    time = at;
    scene ??= studioScene(canvas);
    if (configured !== next) {
      scene.configure(next);
      configured = next;
    }
    resize();
    state = "playing";
    start = performance.now() - at * 1000;
    drawnFrame = -1;
    onState(state);
    startAudio();
    tick();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function visibility() {
    if (document.hidden && state === "playing") pause();
  }
  document.addEventListener("visibilitychange", visibility);

  return {
    async showDraft(next: Config) {
      pause();
      const order = revision;
      const { studioScene } = await import("./scene");
      if (order !== revision || disposed) return false;
      scene ??= studioScene(canvas);
      scene.configure(next);
      configured = next;
      resize();
      return true;
    },
    restorePreview() {
      revision++;
      if (scene && config && configured !== config) {
        scene.configure(config);
        configured = config;
        resize();
      }
    },
    play: (next: Config) => startFrom(next, 0),
    pause,
    async resume() {
      if (config && state !== "playing") await startFrom(config, time >= config.duration ? 0 : time);
    },
    setSound(enabled: boolean) {
      if (enabled === sound) return;
      sound = enabled;
      stopAudio();
      startAudio();
    },
    pick(event: MouseEvent): number {
      const rect = canvas.getBoundingClientRect();
      if (!scene || !rect.width || !rect.height) return -1;
      return scene.pickTarget(2 * (event.clientX - rect.left) / rect.width - 1,
        1 - 2 * (event.clientY - rect.top) / rect.height);
    },
    dispose() {
      disposed = true;
      pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      scene?.dispose();
      if (context) void context.close().catch(() => {});
    },
  };
}
