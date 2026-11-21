import { mountRoom } from "./pixared-room";
import {
  createDraft,
  createFilm,
  draftConfig,
  prepareLogo,
  targetOptions,
  type FilmDraft,
} from "./pixared-film";
import { createExportTracker, type ExportState } from "./pixared-export";
import "./pixared.css";

const room = mountRoom(document.querySelector<HTMLElement>("#app")!);
room.screen.style.containerType = "size";
room.screen.innerHTML = `<div class="px-frame"><video muted playsinline preload="none" poster="/pixared/pixar.jpg" aria-label="Sample performance. A desk lamp lands on the I in PIXAR."></video><canvas hidden aria-label="Your film preview"></canvas></div>`;
room.panel.innerHTML = `<section class="px-sheet" hidden>
  <form novalidate>
    <div class="px-head"><h1 id="px-title" tabindex="-1">Your name</h1><label class="px-motion"><input type="checkbox"> Room motion</label><button type="button" data-action="close">Close</button></div>
    <div class="px-art">
      <input class="px-name" aria-label="Your name" placeholder="e.g. Sam" spellcheck="false" autocomplete="off" enterkeyhint="go">
      <div class="px-logo" hidden><img alt=""><div><span></span><small></small></div><button type="button" data-action="name">Use a name</button></div>
      <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" hidden>
      <div class="px-actions"><button type="submit">Play my preview</button><button type="button" data-action="upload">Upload a logo</button></div>
      <div class="px-extras"><button type="button" data-action="saved-logo" hidden>Use saved logo</button><button type="button" data-action="settings" hidden>Film settings</button></div>
    </div>
    <div class="px-settings" hidden>
      <label>Landing<select name="target"></select></label>
      <label>Film shape<select name="aspect"><option value="landscape">Landscape</option><option value="square">Square</option><option value="portrait">Portrait</option></select></label>
      <label data-ending>Name ending<select name="ending"><option value="replace">Lamp replaces letter</option><option value="restore">Restore full name</option></select></label>
      <div class="px-paints"><label>Lamp<input name="lamp" type="color"></label><label data-lettering>Lettering<input name="text" type="color"></label><label>Backdrop<input name="background" type="color"></label></div>
      <button type="button" data-action="match" hidden>Match colors to logo</button>
      <div class="px-actions"><button type="submit">Play my preview</button><button type="button" data-action="art">Edit artwork</button></div>
    </div>
    <p class="px-error" role="alert" id="px-error"></p>
    <span class="px-sr" role="status"></span>
  </form>
</section>`;
room.fascia.innerHTML = `<div class="px-keys"><button data-action="transport">Replay</button><button data-action="edit">Edit</button><button data-action="prepare" disabled>Prepare MP4</button><a data-action="download" hidden download>Download MP4</a></div>
<div class="px-export-note" hidden><span role="status"></span><button data-action="new-version" hidden>Prepare current film</button></div>`;
const sheet = room.panel.querySelector<HTMLElement>(".px-sheet")!;
const get = <T extends HTMLElement>(
  selector: string,
  host: ParentNode = sheet,
) => host.querySelector<T>(selector)!;
const action = (name: string, host: ParentNode = sheet) =>
  get<HTMLButtonElement>(`[data-action="${name}"]`, host);
const canvas = get<HTMLCanvasElement>("canvas", room.screen);
const video = get<HTMLVideoElement>("video", room.screen);
const frame = get<HTMLElement>(".px-frame", room.screen);
const nameInput = get<HTMLInputElement>(".px-name");
const fileInput = get<HTMLInputElement>('input[type="file"]');
const target = get<HTMLSelectElement>('[name="target"]');
const title = get<HTMLElement>("h1");
const motion = get<HTMLInputElement>(".px-motion input");
const notice = get<HTMLElement>(".px-error");
const transport = action("transport", room.fascia);
const edit = action("edit", room.fascia);
const prepare = action("prepare", room.fascia);
const download = get<HTMLAnchorElement>(
  '[data-action="download"]',
  room.fascia,
);
const exportNote = get<HTMLElement>(".px-export-note", room.fascia);
const newVersion = action("new-version", room.fascia);
const names = createDraft("name"),
  logos = createDraft("logo");
let draft = names,
  settings = false,
  personal = false,
  busy = false,
  uploadSequence = 0;
let previewDraft: FilmDraft | undefined;
let previewConfig: ReturnType<typeof draftConfig> | undefined;
let playRequest = 0;
function cancelPendingPreview() {
  if (!busy) return;
  ++playRequest;
  busy = false;
  film.pause();
  if (!personal) canvas.hidden = true;
  setRatio(previewConfig);
  disableSubmit(false);
  get(".px-sr").textContent = "";
}
function setRatio(config?: ReturnType<typeof draftConfig>) {
  const aspect = config?.aspect ?? "landscape";
  frame.classList.toggle("px-full-picture", aspect === "landscape" && !config?.logo);
  room.screen.style.backgroundColor = config?.background ?? "#94a9cf";
  frame.style.setProperty(
    "--ratio",
    String(aspect === "portrait" ? 9 / 16 : aspect === "square" ? 1 : 16 / 9),
  );
}
let playing: "playing" | "paused" | "ended" = "ended";
let sound = false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const film = createFilm(
  canvas,
  (state) => {
    playing = state;
    updateTransport();
  },
  (message) => showMessage(message),
);
const tracker = createExportTracker(updateExport);

function showMessage(message: string) {
  notice.textContent = message;
  if (sheet.hidden && message) {
    exportNote.hidden = false;
    get("span", exportNote).textContent = message;
  }
}
function updateTransport() {
  transport.textContent = personal
    ? { playing: "Pause", paused: "Resume", ended: "Replay" }[playing]
    : video.paused
      ? "Replay"
      : "Pause";
}
function matchesPreview() {
  if (!previewDraft) return false;
  return (
    [
      "mode",
      "name",
      "art",
      "aspect",
      "ending",
      "lamp",
      "text",
      "background",
      "target",
    ] as const
  ).every((key) => draft[key] === previewDraft![key]);
}
function editedConfig() {
  if (matchesPreview()) return previewConfig;
  try {
    return draftConfig(draft);
  } catch {
    return undefined;
  }
}
function updateExport(state: ExportState) {
  const ready = state.phase === "ready";
  const waiting = state.phase === "preparing";
  const retry = state.phase === "failed" && state.canRetry;
  prepare.hidden = ready;
  const current = personal ? editedConfig() : undefined;
  prepare.disabled = waiting || (!current && !retry);
  prepare.textContent = waiting
    ? "Preparing…"
    : retry
      ? "Retry render"
      : "Prepare MP4";
  download.hidden = !ready;
  if (state.downloadUrl) download.href = state.downloadUrl;
  else download.removeAttribute("href");
  const changed =
    !!current && state.phase !== "idle" && !tracker.matches(current);
  newVersion.hidden = !(changed && (ready || state.phase === "failed"));
  get("span", exportNote).textContent = [
    state.version,
    changed ? state.settings : "",
    state.message,
  ]
    .filter(Boolean)
    .join(" · ");
  const edited = state.phase === "idle" && current && !matchesPreview();
  if (edited)
    get("span", exportNote).textContent =
      "Prepare MP4 will use the edited film · " +
      current.name +
      " · " +
      current.aspect;
  exportNote.hidden = state.phase === "idle" && !edited;
  if (!sheet.hidden) get(".px-sr").textContent = state.message;
}
let showingDraft = false;
function hideDraft() {
  if (!showingDraft) return;
  showingDraft = false;
  film.restorePreview();
  canvas.hidden = !personal;
  video.hidden = personal;
  setRatio(previewConfig);
}
async function showName() {
  const cfg = editedConfig();
  if (!cfg) { hideDraft(); return; }
  showingDraft = true;
  video.pause();
  try {
    if (!(await film.showDraft(cfg))) return;
    setRatio(cfg);
    video.hidden = true;
    canvas.hidden = false;
  } catch {
    hideDraft();
  }
}
function setDraft(next: FilmDraft) {
  hideDraft();
  cancelPendingPreview();
  draft = next;
  settings = false;
  nameInput.value = names.name;
  nameInput.hidden = draft.mode === "logo";
  const card = get<HTMLElement>(".px-logo");
  card.hidden = draft.mode !== "logo";
  if (logos.art) {
    get<HTMLImageElement>("img", card).src = logos.art.thumbnail;
    get("span", card).textContent = logos.art.name;
    get("small", card).textContent = logos.art.description;
  }
  action("saved-logo").hidden = draft !== names || !logos.art;
  action("settings").hidden = !personal;
  showMessage("");
  nameInput.removeAttribute("aria-invalid");
  displayEditor();
}
function displayEditor() {
  get(".px-art").hidden = settings;
  get(".px-settings").hidden = !settings;
  title.textContent = settings
    ? "Film settings"
    : draft.mode === "name"
      ? "Your name"
      : "Your logo";
  if (!settings) return;
  target.replaceChildren(
    new Option("Automatic", ""),
    ...targetOptions(draft).map((x) => new Option(x.label, String(x.value))),
  );
  target.value = draft.target === undefined ? "" : String(draft.target);
  for (const key of ["aspect", "ending", "lamp", "text", "background"] as const)
    get<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`).value =
      draft[key];
  get("[data-ending]").hidden = get("[data-lettering]").hidden =
    draft.mode === "logo";
  action("match").hidden = draft.mode !== "logo";
}
const inerted: HTMLElement[] = [];
function openPanel(advanced = false) {
  if (sheet.hidden) {
    room.setOpen(true);
    sheet.hidden = false;
    room.controls.setAttribute("role", "dialog");
    room.controls.setAttribute("aria-modal", "true");
    room.controls.setAttribute("aria-labelledby", "px-title");
    for (
      let el: HTMLElement | null = sheet;
      el && el !== document.body;
      el = el.parentElement
    ) {
      for (const sibling of el.parentElement?.children ?? []) {
        if (
          sibling !== el && sibling !== room.source &&
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      }
    }
  }
  setDraft(draft);
  settings = advanced;
  displayEditor();
  (advanced ? target : title).focus({ preventScroll: true });
}
function closePanel(focus: HTMLElement = edit) {
  cancelPendingPreview();
  hideDraft();
  uploadSequence++;
  cancelUpload();
  for (const el of inerted.splice(0)) el.inert = false;
  sheet.hidden = true;
  for (const attr of ["role", "aria-modal", "aria-labelledby"]) room.controls.removeAttribute(attr);
  updateExport(tracker.state);
  room.setOpen(false);
  focus.focus({ preventScroll: true });
  showMessage("");
}
room.controls.addEventListener("keydown", (e) => {
  if (sheet.hidden) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closePanel();
    return;
  }
  if (e.key !== "Tab") return;
  const items = [
    room.source,
    ...sheet.querySelectorAll<HTMLElement>(
      "input:not(:disabled),button:not(:disabled),select:not(:disabled)",
    ),
  ].filter((el) => el.getClientRects().length);
  if (
    e.shiftKey &&
    (document.activeElement === items[0] || document.activeElement === title)
  ) {
    e.preventDefault();
    items.at(-1)?.focus();
  } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
    e.preventDefault();
    items[0]?.focus();
  }
});
function applyMotion() {
  room.setRoomMotion(motion.checked);
  if (reduced.matches && !personal) {
    video.pause();
  }
}
motion.checked = !reduced.matches;
motion.onchange = applyMotion;
reduced.addEventListener("change", () => {
  motion.checked = !reduced.matches;
  applyMotion();
});
action("close").onclick = () => closePanel();
edit.onclick = () => openPanel();
room.landing.onclick = () => openPanel(personal);
room.sound.setAttribute("aria-pressed", "false");
room.sound.onclick = () => {
  sound = !sound;
  room.sound.setAttribute("aria-pressed", String(sound));
  film.setSound(sound);
};
nameInput.oninput = () => {
  uploadSequence++;
  cancelUpload();
  names.name = nameInput.value;
  names.target = undefined;
  void showName();
  showMessage("");
  nameInput.removeAttribute("aria-invalid");
};
action("name").onclick = () => {
  uploadSequence++;
  cancelUpload();
  setDraft(names);
  nameInput.focus();
};
action("saved-logo").onclick = () => {
  uploadSequence++;
  cancelUpload();
  setDraft(logos);
  title.focus();
};
action("art").onclick = () => {
  settings = false;
  displayEditor();
  title.focus();
};
action("settings").onclick = () => {
  settings = true;
  displayEditor();
  target.focus();
};
action("match").onclick = () => {
  if (logos.art) {
    logos.lamp = logos.art.lamp;
    logos.background = logos.art.background;
    displayEditor();
  }
};
target.onchange = () => {
  draft.target = target.value === "" ? undefined : Number(target.value);
};
get<HTMLSelectElement>('[name="aspect"]').onchange = (e) => {
  draft.aspect = (e.target as HTMLSelectElement).value as FilmDraft["aspect"];
};
get<HTMLSelectElement>('[name="ending"]').onchange = (e) => {
  draft.ending = (e.target as HTMLSelectElement).value as FilmDraft["ending"];
};
for (const key of ["lamp", "text", "background"] as const)
  get<HTMLInputElement>(`[name="${key}"]`).oninput = (e) => {
    draft[key] = (e.target as HTMLInputElement).value;
  };
function disableSubmit(disabled: boolean) {
  for (const b of sheet.querySelectorAll<HTMLButtonElement>(
    'button[type="submit"]',
  ))
    b.disabled = disabled;
}
function cancelUpload() {
  disableSubmit(false);
  action("upload").textContent = "Upload a logo";
}
action("upload").onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  const seq = ++uploadSequence;
  disableSubmit(true);
  action("upload").textContent = "Reading logo…";
  showMessage("");
  try {
    const art = await prepareLogo(file);
    if (seq !== uploadSequence) return;
    logos.art = art;
    logos.target = undefined;
    setDraft(logos);
    get(".px-sr").textContent =
      art.name + " is ready to preview. " + art.description;
    get<HTMLButtonElement>('.px-art button[type="submit"]').focus();
    action("upload").textContent = "Upload a logo";
  } catch (e) {
    if (seq !== uploadSequence) return;
    showMessage(
      e instanceof Error ? e.message : "This logo could not be opened.",
    );
    action("upload").textContent = "Choose another file";
  } finally {
    if (seq === uploadSequence) disableSubmit(false);
  }
};
async function playDraft() {
  if (busy) return;
  const submitted = { ...draft };
  let cfg: ReturnType<typeof draftConfig>;
  try {
    if (submitted.mode === "name" && !submitted.name.trim())
      throw Error("Enter your name to play the preview.");
    cfg = draftConfig(submitted);
  } catch (e) {
    showMessage(e instanceof Error ? e.message : "Check the artwork.");
    if (draft.mode === "name") {
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.setAttribute("aria-describedby", "px-error");
      nameInput.focus();
    }
    return;
  }
  hideDraft();
  const request = ++playRequest;
  busy = true;
  disableSubmit(true);
  get(".px-sr").textContent = "Opening preview…";
  try {
    setRatio(cfg);
    canvas.hidden = false;
    video.pause();
    await film.play(cfg);
    if (request !== playRequest) return;
    busy = false;
    personal = true;
    previewDraft = submitted;
    previewConfig = cfg;
    video.hidden = true;
    updateTransport();
    updateExport(tracker.state);
    closePanel(transport);
  } catch (e) {
    if (request !== playRequest) return;
    setRatio(previewConfig);
    if (!personal) canvas.hidden = true;
    showMessage(
      e instanceof Error ? e.message : "The preview could not start.",
    );
  } finally {
    if (request === playRequest) {
      busy = false;
      disableSubmit(false);
    }
  }
}
sheet.addEventListener(
  "input",
  (e) => {
    if (e.target !== motion) cancelPendingPreview();
  },
  true,
);
get<HTMLFormElement>("form").onsubmit = (e) => {
  e.preventDefault();
  void playDraft();
};
canvas.onclick = async (e) => {
  if (!previewDraft || !sheet.hidden || busy) return;
  const index = film.pick(e);
  if (index < 0) return;
  if (!matchesPreview()) {
    openPanel();
    showMessage(
      "Play your edited film before choosing a landing on the picture.",
    );
    return;
  }
  draft.target = index;
  await playDraft();
};
transport.onclick = async () => {
  try {
    if (!personal) {
      if (video.paused) {
        video.currentTime = 0;
        await video.play();
      } else video.pause();
    } else if (playing === "playing") film.pause();
    else await film.resume();
  } catch (e) {
    showMessage(e instanceof Error ? e.message : "Playback could not resume.");
  }
};
function prepareCurrent() {
  const current = editedConfig();
  if (current) void tracker.prepare(current);
}
prepare.onclick = () => {
  if (tracker.state.phase === "failed" && tracker.state.canRetry)
    void tracker.retry();
  else prepareCurrent();
};
newVersion.onclick = prepareCurrent;
video.onplay = video.onpause = updateTransport;
video.onended = () => video.load();
setRatio();
video.src = "/pixared/pixar.mp4";
document.addEventListener("visibilitychange", () => {
  if (document.hidden) video.pause();
});
applyMotion();
openPanel();
if (motion.checked) void video.play().catch(() => {});
