import { analyze, snapshot } from "./config.mjs";
import type { Config } from "./scene";
import type { Logo } from "./logo";

export type ExportState = {
  phase: "idle" | "preparing" | "ready" | "failed";
  version: string;
  settings: string;
  message: string;
  canRetry: boolean;
  downloadUrl?: string;
};

type Job = { id: string; status: string; error?: string };

function renderFailure(job: Job) {
  if (job.status === "canceled") return "The render was canceled. Your film settings are saved.";
  if (!job.error) return "The render failed. Your film settings are saved.";
  if (/browserType\.launch|Chromium unavailable/i.test(job.error)) {
    return "The render browser could not start. Your film settings are saved.";
  }
  return job.error.split("\n")[0].slice(0, 180);
}

function sameLogo(a?: Logo, b?: Logo) {
  if (a === b) return true;
  if (!a || !b) return false;
  if ("svg" in a) return "svg" in b && a.svg === b.svg;
  return "rgba" in b && a.w === b.w && a.h === b.h && a.rgba === b.rgba;
}

export function createExportTracker(onChange: (state: ExportState) => void) {
  let state: ExportState = { phase: "idle", version: "", settings: "", message: "", canRetry: false };
  let saved: Config | undefined;
  let id: string | undefined;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;
  const lifetime = new AbortController();

  function show(phase: ExportState["phase"], message: string, downloadUrl?: string) {
    if (lifetime.signal.aborted) return;
    state = { ...state, phase, message, downloadUrl, canRetry: phase === "failed" };
    onChange(state);
  }

  async function request<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(path, {
      method: data === undefined ? "GET" : "POST",
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
      ...(data === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw Error("The render service is unavailable.");
    }
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "The render service is unavailable.");
    return result;
  }

  async function poll(jobId: string) {
    let delay = 1000;
    try {
      // The Studio lists all jobs. Only the ID returned by our submission belongs in this UI.
      const list = await request<Job[]>("/api/jobs");
      if (lifetime.signal.aborted || jobId !== id) return;
      const job = list.find((item) => item.id === jobId);
      if (!job) {
        id = undefined;
        return show("failed", "This render is no longer available. Retry to prepare the saved version.");
      }
      if (job.status === "complete") return show("ready", "Your MP4 is ready.", "/api/download/" + encodeURIComponent(jobId));
      if (job.status === "failed" || job.status === "canceled") {
        return show("failed", renderFailure(job));
      }
      const message = job.status === "encoding" ? "Encoding the MP4…" : "Preparing…";
      if (state.message !== message) show("preparing", message);
    } catch {
      if (lifetime.signal.aborted || jobId !== id) return;
      const message = "Reconnecting to the render service…";
      if (state.message !== message) show("preparing", message);
      delay = 2500;
    }
    if (!lifetime.signal.aborted && jobId === id) timer = setTimeout(() => void poll(jobId), delay);
  }

  async function submit() {
    if (lifetime.signal.aborted || !saved || state.phase === "preparing") return;
    clearTimeout(timer);
    show("preparing", "Preparing…");
    try {
      if (id) {
        await request("/api/jobs/" + encodeURIComponent(id) + "/retry", {});
      } else {
        const response = await request<{ ids: string[]; errors?: { error: string }[] }>("/api/jobs", { entries: [saved] });
        if (!response.ids?.[0]) throw Error(response.errors?.[0]?.error || "The film could not be submitted.");
        id = response.ids[0];
      }
    } catch (error) {
      if (lifetime.signal.aborted) return;
      // A retry can reach Studio even when its response is lost. Read this known job again first.
      if (id) return poll(id);
      show("failed", error instanceof Error ? error.message : "Could not connect to the render service.");
      return;
    }
    if (!lifetime.signal.aborted) await poll(id);
  }

  return {
    get state() { return state; },
    matches(config: Config) {
      if (!saved) return false;
      return saved.name === config.name && saved.target === config.target && saved.aspect === config.aspect &&
        saved.lamp === config.lamp && saved.background === config.background && saved.text === config.text &&
        saved.ending === config.ending && sameLogo(saved.logo, config.logo);
    },
    async prepare(config: Config) {
      if (lifetime.signal.aborted || state.phase === "preparing") return;
      saved = snapshot(config);
      id = undefined;
      const target = saved.logo ? "Part " + (saved.target + 1) : "Letter " + (saved.target + 1) + " · " + analyze(saved.name).chars[saved.target];
      const details = [target, "Lamp " + saved.lamp, "Backdrop " + saved.background];
      if (!saved.logo) details.push("Lettering " + saved.text, saved.ending === "replace" ? "Lamp replaces letter" : "Restore full name");
      state = { ...state, version: saved.name + " · " + saved.aspect + " · v" + (++revision), settings: details.join(" · ") };
      await submit();
    },
    async retry() {
      if (state.canRetry) await submit();
    },
    dispose() {
      lifetime.abort();
      clearTimeout(timer);
    },
  };
}
