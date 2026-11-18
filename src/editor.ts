import "./studio.css";
import { studioScene } from "./scene";
import { analyze, defaults, presets, snapshot } from "./config.mjs";
import { icon } from "./icons";
import { soundtrack, sampleRate } from "./foley.mjs";
import { importLogo, inspectLogo, type Logo } from "./logo";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const colors = ["lamp", "text", "background"] as const,
  formats = Object.keys(presets) as (keyof typeof presets)[];
import { chapters } from "./timeline.mjs";
const phases = chapters as [string, number][],
  duration = defaults.duration,
  fps = defaults.fps;
$("#app").innerHTML =
  `<header><div class="brand"><span class="brand-mark">${icon("lamp")}</span>Lamp Name <b>Studio</b></div><nav aria-label="Workspace"><button id="editorTab" aria-pressed="true">${icon("sliders")}Editor</button><button id="queueTab" aria-pressed="false">${icon("layers")}Render queue <i id="count">0</i></button></nav><span class="local"><em></em> LOCAL WORKSPACE</span></header>
<div class="workspace"><section id="editor"><div class="intro"><div><p class="eyebrow"><i></i> ANIMATION WORKSPACE</p><h1>Scene editor</h1><p>Stage a name, direct the lamp, and render your film.</p></div><button class="secondary" id="batchLink">${icon("layers")} Batch names</button></div>
<div class="grid"><div class="screen-col"><section class="panel monitor"><div class="panel-title"><h2>${icon("stage")} Scene preview</h2><span class="status"><em></em> LIVE VIEW</span></div><div id="stage"><div id="frame"><canvas aria-label="Articulated lamp interacting with the personalized name"></canvas><span class="cam"><i></i> CAM 01</span><b class="corner tl"></b><b class="corner tr"></b><b class="corner bl"></b><b class="corner br"></b><small class="frame-id">STUDIO / 01</small></div><p id="loading">Preparing the 3D stage...</p></div>
<div class="transport"><button id="play" class="primary icon-btn" aria-label="Play performance">${icon("play")}</button><button id="restart" class="icon-btn" aria-label="Restart performance">${icon("restart")}</button><output id="time">00:00.00</output><input id="scrub" type="range" min="0" max="${duration}" step="0.001" value="0" aria-label="Performance time"><span class="mono">00:${duration}.00</span><button class="icon-btn" id="full" aria-label="Toggle full screen preview">${icon("expand")}</button></div></section>
<section class="panel sequence"><div class="panel-title"><h2>${icon("film")} Performance timeline</h2><span class="mono">7 BEATS</span></div><div class="track" id="beats"></div><div class="times"><span>00:00</span><label><input type="checkbox" id="mute"> Mute preview</label><span>00:${duration}</span></div></section>
<div class="tech"><span><i></i> DETERMINISTIC TIMELINE</span><span>${fps} FPS <b>/</b> ${fps * duration} FRAMES</span></div></div>
<aside class="panel settings"><div class="panel-title"><h2>${icon("sliders")} Scene settings</h2><button id="reset" title="Restore defaults" aria-label="Restore defaults">${icon("restart")}</button></div>
<div class="section"><h3><small>01</small> Personalization</h3><fieldset class="mode"><legend>Artwork</legend><label><input type="radio" name="mode" value="name" checked> Name</label><label><input type="radio" name="mode" value="logo"> Logo</label></fieldset><div id="namePanel"><label for="name">Display name <span id="length"></span></label><input id="name" value="SAMUEL" required spellcheck="false" aria-invalid="false" aria-describedby="hint"><p class="hint" id="hint">1–24 Latin characters. Accents, spaces, hyphens and apostrophes supported.</p><p id="error" class="error" role="status"></p><div class="label">Target letter <button id="auto" class="auto">Auto</button></div><div id="letters"></div></div><div id="logoPanel" hidden><label for="upload">Logo artwork</label><input id="upload" type="file" accept="image/svg+xml,image/png" aria-describedby="logoHelp"><p id="logoHelp" class="hint">Outlined SVG or transparent PNG · up to 2 MB</p><p role="status" id="logoMsg"></p><label for="part">Landing part (left to right)</label><select id="part"></select><button class="secondary" id="match">Match colors to logo</button></div></div>
<div class="section"><h3><small>02</small> Appearance</h3><div class="swatches">${colors.map((k) => `<label for="${k}"><span class="swatch"><input type="color" id="${k}" value="${defaults[k]}"></span>${k === "background" ? "Backdrop" : k === "lamp" ? "Lamp" : "Lettering"}</label>`).join("")}</div></div>
<div class="section"><h3><small>03</small> Output format</h3><div class="formats">${formats.map((k, i) => `<button data-format="${k}"><i class="shape ${k}"></i>${k}<small>${["16:9", "1:1", "9:16"][i]}</small></button>`).join("")}</div></div>
<div class="section"><label for="ending">Final pose</label> <select id="ending"><option value="replace">Lamp replaces letter</option><option value="restore">Restore full name</option></select></div><div class="export"><div class="spec"><span id="dims"></span><span>${duration} SEC · ${fps} FPS</span></div><button id="export" class="primary">${icon("download")} Export MP4</button><p>H.264 <i>·</i> Stereo foley <i>·</i> Local render</p></div></aside></div></section>
<section id="queue" hidden><div class="intro"><div><p class="eyebrow"><i></i> LOCAL PRODUCTION</p><h1>Render queue</h1><p>Render one film per name, in the order you add them.</p></div><button id="back" class="secondary">${icon("sliders")} Scene editor</button></div><div class="qgrid"><section class="panel"><div class="panel-title"><h2>${icon("layers")} Batch names</h2></div><div class="section"><label for="batch">Names, one per line</label><textarea id="batch" rows="7" placeholder="SAMUEL&#10;Zoë&#10;Anne-Marie"></textarea><p class="hint">Uses the current colors and format. A central target is chosen for each name.</p><button id="enqueue" class="primary">${icon("plus")} Add to queue</button><p id="batchMsg" role="status"></p></div></section><section class="panel jobs"><div class="panel-title"><h2>${icon("list")} Jobs</h2><a href="/api/collection.zip" id="zip">${icon("download")} Collect ZIP</a></div><div id="jobs"></div></section></div></section>
<footer><span>${icon("lamp")} LAMP NAME STUDIO</span><span>LOCAL RENDER ENGINE <i>/</i> V1.0</span></footer></div><div id="notice" role="status"></div>`;
let raw: string = defaults.name,
  manual: number | undefined,
  aspect: keyof typeof presets = "landscape",
  cfg = snapshot(defaults),
  t = 4.25,
  poster = true,
  playing = false,
  start = 0,
  ready = false,
  invalid = "",
  showError = false,
  lastFrame = -1;
let studio: ReturnType<typeof studioScene>;
let logoMode = false,
  logo: Logo | undefined,
  logoLabel = "",
  logoTarget = 0,
  uploadVersion = 0;
const appearance = () =>
  Object.fromEntries(
    colors.map((k) => [k, $<HTMLInputElement>("#" + k).value]),
  );
const draft = () => ({
  appearance: appearance(),
  aspect,
  ending: $<HTMLSelectElement>("#ending").value,
  t,
  poster,
});
let nameDraft = draft(),
  logoDraft = { ...draft(), ending: "restore" };
const canvas = $("canvas") as HTMLCanvasElement,
  name = $<HTMLInputElement>("#name"),
  scrub = $<HTMLInputElement>("#scrub");
const clock = (s: number) => `00:${s.toFixed(2).padStart(5, "0")}`;
function draw() {
  if (!ready) return;
  studio.draw(t);
  $("#time").textContent = clock(t);
  scrub.value = String(t);
  scrub.style.setProperty("--pct", `${(t * 100) / duration}%`);
  document
    .querySelectorAll<HTMLButtonElement>("[data-t]")
    .forEach((b, i) =>
      b.classList.toggle(
        "active",
        t >= phases[i][1] && t < (phases[i + 1]?.[1] ?? Infinity),
      ),
    );
}
function resize() {
  if (!ready) return;
  const r = $("#frame").getBoundingClientRect();
  if (!r.width) return;
  const [w, h] = presets[cfg.aspect as keyof typeof presets],
    scale = Math.min(w / r.width, devicePixelRatio, 2);
  studio.resize(
    Math.round(r.width * scale),
    Math.round((r.width * scale * h) / w),
  );
  draw();
}
let raf = 0;
let ac: AudioContext | undefined,
  source: AudioBufferSourceNode | undefined,
  gain: GainNode | undefined,
  audioStart = 0,
  cachedKey = "",
  buffer: AudioBuffer | undefined;
$("#mute").onchange = () => {
  if (gain) gain.gain.value = $<HTMLInputElement>("#mute").checked ? 0 : 1;
};
function pause() {
  cancelAnimationFrame(raf);
  playing = false;
  if (source) {
    source.stop();
    source.disconnect();
    source = undefined;
  }
  $("#play").innerHTML = icon("play");
  $("#play").setAttribute("aria-label", "Play performance");
}
function tick(now: number) {
  if (!playing) return;
  t = Math.min(
    duration,
    source && ac
      ? Math.max(0, ac.currentTime - audioStart)
      : (now - start) / 1000,
  );
  if (Math.floor(t * fps) !== lastFrame) {
    draw();
    lastFrame = Math.floor(t * fps);
  }
  if (t >= duration) pause();
  else raf = requestAnimationFrame(tick);
}
function play() {
  if (!ready || playing || (logoMode && !logo)) return;
  if (poster || t >= duration) t = 0;
  poster = false;
  playing = true;
  try {
    ac ??= new AudioContext();
    void ac.resume().catch(() => {
      pause();
      notice("Audio device unavailable. Check browser audio permissions.");
    });
    if (!gain) {
      gain = ac.createGain();
      gain.connect(ac.destination);
    }
    gain.gain.value = $<HTMLInputElement>("#mute").checked ? 0 : 1;
    const key = JSON.stringify([cfg.name, cfg.target, cfg.ending]);
    if (!buffer || cachedKey !== key) {
      const [l, r] = soundtrack(cfg);
      buffer = ac.createBuffer(2, l.length, sampleRate);
      buffer.getChannelData(0).set(l);
      buffer.getChannelData(1).set(r);
      cachedKey = key;
    }
    source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    audioStart = ac.currentTime - t;
    source.start(0, t);
  } catch {
    source = undefined;
    notice("Audio unavailable; playing the visual preview.");
  }
  start = performance.now() - t * 1000;
  lastFrame = -1;
  $("#play").innerHTML = icon("pause");
  $("#play").setAttribute("aria-label", "Pause performance");
  raf = requestAnimationFrame(tick);
}
function errorState() {
  const msg = showError ? invalid : "";
  $("#error").textContent = msg;
  name.setAttribute("aria-invalid", String(!!msg));
  name.setAttribute("aria-describedby", msg ? "hint error" : "hint");
  name.setCustomValidity(invalid);
}
function update() {
  pause();
  if (logoMode) {
    if (!logo) return;
    cfg = snapshot({
      name: logoLabel,
      logo,
      target: logoTarget,
      ending: "restore",
      aspect,
      ...appearance(),
    });
    invalid = "";
    updateScene();
    return;
  }
  raw = name.value;
  let info;
  try {
    info = analyze(raw);
    invalid = "";
  } catch (e) {
    invalid = (e as Error).message;
    $("#letters").replaceChildren();
    $("#length").textContent = "";
    errorState();
    return;
  }
  errorState();
  cfg = snapshot({
    name: raw,
    aspect,
    target: manual,
    ending: $<HTMLSelectElement>("#ending").value,
    ...Object.fromEntries(
      colors.map((k) => [k, $<HTMLInputElement>("#" + k).value]),
    ),
  });
  $("#length").textContent = `${info.chars.length} / 24`;
  $("#letters").innerHTML = info.eligible
    .map(
      (i) =>
        `<button data-letter="${i}" aria-label="Target ${esc(info.chars[i])}, position ${i + 1}" aria-pressed="${cfg.target === i}">${esc(info.chars[i])}</button>`,
    )
    .join("");
  $("#auto").setAttribute("aria-pressed", String(manual === undefined));
  updateScene();
}
function updateScene() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-format]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.format === aspect)),
    );
  const [w, h] = presets[aspect];
  $("#dims").textContent = `${w} × ${h}`;
  $("#frame").style.setProperty("--ratio", String(w / h));
  $("#frame").classList.toggle("narrow", aspect !== "landscape");
  if (ready) {
    studio.configure(cfg);
    resize();
  }
}
function artworkReady() {
  const empty = logoMode && !logo;
  $("#frame").style.visibility = empty ? "hidden" : "";
  if (ready) {
    $("#loading").hidden = !empty;
    if (empty)
      $("#loading").textContent = "Upload a logo to preview the performance.";
  }
  for (const id of ["play", "restart", "export", "match", "part"])
    $<HTMLButtonElement>("#" + id).disabled = empty;
}
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(
  (r) =>
    (r.onchange = () => {
      pause();
      uploadVersion++;
      if (logoMode) logoDraft = draft();
      else nameDraft = draft();
      logoMode = r.value === "logo";
      const d = logoMode ? logoDraft : nameDraft;
      $("#namePanel").hidden = logoMode;
      $("#logoPanel").hidden = !logoMode;
      $('label[for="text"]').hidden = logoMode;
      $("#batchLink").hidden = logoMode;
      $<HTMLSelectElement>("#ending").disabled = logoMode;
      $<HTMLSelectElement>("#ending").options[1].text = logoMode
        ? "Restore full logo"
        : "Restore full name";
      $<HTMLSelectElement>("#ending").value = d.ending;
      aspect = d.aspect;
      t = d.t;
      poster = d.poster;
      colors.forEach(
        (k) => ($<HTMLInputElement>("#" + k).value = d.appearance[k]),
      );
      artworkReady();
      update();
    }),
);
$("#upload").onchange = async () => {
  const file = $<HTMLInputElement>("#upload").files?.[0];
  if (!file) return;
  const version = ++uploadVersion;
  pause();
  logo = undefined;
  $("#part").replaceChildren();
  $("#logoMsg").textContent = "Preparing artwork...";
  artworkReady();
  try {
    const next = await importLogo(file);
    if (version !== uploadVersion) return;
    const { parts } = inspectLogo(next);
    logoTarget = parts.reduce(
      (best, p, i) =>
        Math.abs(p.crown) < Math.abs(parts[best].crown) ? i : best,
      0,
    );
    parts.forEach((_, i) =>
      $<HTMLSelectElement>("#part").add(new Option(`Part ${i + 1}`, String(i))),
    );
    $<HTMLSelectElement>("#part").value = String(logoTarget);
    logoLabel = file.name.slice(0, 100);
    logo = next;
    $("#logoMsg").textContent =
      `${logoLabel} · ${parts.length} selectable ${parts.length === 1 ? "part" : "parts"}`;
    artworkReady();
    update();
  } catch (e) {
    if (version !== uploadVersion) return;
    logo = undefined;
    $("#logoMsg").textContent = (e as Error).message;
    artworkReady();
  }
};
$("#part").onchange = () => {
  logoTarget = Number($<HTMLSelectElement>("#part").value);
  update();
};
canvas.onclick = (e) => {
  if (!logoMode || !ready || !logo) return;
  const b = canvas.getBoundingClientRect(),
    i = studio.pickLogoPart(
      (2 * (e.clientX - b.left)) / b.width - 1,
      1 - (2 * (e.clientY - b.top)) / b.height,
    );
  if (i < 0) return;
  logoTarget = i;
  $<HTMLSelectElement>("#part").value = String(i);
  update();
};
$("#match").onclick = () => {
  if (!logo) return;
  const match = inspectLogo(logo);
  for (const k of ["lamp", "background"] as const)
    $<HTMLInputElement>("#" + k).value = match[k];
  update();
};
$("#beats").innerHTML = phases
  .map(
    ([k, n], i) =>
      `<button data-t="${n}" aria-label="Seek to ${k}, ${n} seconds"><i></i><small>${String(i + 1).padStart(2, "0")}</small>${k}</button>`,
  )
  .join("");
$("#beats").onclick = (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) {
    pause();
    poster = false;
    t = Number(b.dataset.t);
    draw();
  }
};
name.oninput = () => {
  manual = undefined;
  showError = false;
  update();
};
name.onblur = () => {
  showError = true;
  errorState();
};
$("#letters").onclick = (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) {
    manual = Number(b.dataset.letter);
    update();
    $<HTMLButtonElement>(`[data-letter="${manual}"]`).focus();
  }
};
$("#auto").onclick = () => {
  manual = undefined;
  update();
};
colors.forEach((k) => ($("#" + k).onchange = update));
$("#ending").onchange = update;
document.querySelectorAll<HTMLButtonElement>("[data-format]").forEach(
  (b) =>
    (b.onclick = () => {
      aspect = b.dataset.format as typeof aspect;
      update();
    }),
);
$("#reset").onclick = () => {
  if (logoMode) {
    colors.forEach((k) => ($<HTMLInputElement>("#" + k).value = defaults[k]));
    aspect = "landscape";
    t = 4.25;
    poster = true;
    update();
    return;
  }
  name.value = defaults.name;
  aspect = "landscape";
  manual = undefined;
  t = 4.25;
  poster = true;
  $<HTMLSelectElement>("#ending").value = defaults.ending;
  colors.forEach((k) => ($<HTMLInputElement>("#" + k).value = defaults[k]));
  update();
};
$("#play").onclick = () => (playing ? pause() : play());
$("#restart").onclick = () => {
  pause();
  t = 0;
  draw();
  play();
};
scrub.oninput = () => {
  pause();
  poster = false;
  t = Number(scrub.value);
  draw();
};
$("#full").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $(".monitor").requestFullscreen();
  } catch (e) {
    notice(String(e));
  }
};
function view(queue: boolean) {
  pause();
  $("#queue").hidden = !queue;
  $("#editor").hidden = queue;
  $("#editorTab").setAttribute("aria-pressed", String(!queue));
  $("#queueTab").setAttribute("aria-pressed", String(queue));
  if (queue) void refresh();
  else resize();
}
$("#batchLink").onclick = () => {
  view(true);
  $("#batch").focus();
};
$("#queueTab").onclick = () => view(true);
$("#editorTab").onclick = $("#back").onclick = () => view(false);
let noticeTimer = 0;
function notice(msg: string) {
  $("#notice").textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => ($("#notice").textContent = ""), 4300);
}
type Job = {
  id: string;
  config: typeof cfg;
  status: string;
  frames: number;
  error: string | null;
};
async function api(path: string, data?: unknown) {
  const r = await fetch(
    "/api/" + path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : undefined,
  );
  const body = await r.json();
  if (!r.ok) throw Error(body.error ?? "Local render service unavailable.");
  return body;
}
let previous = "";
async function refresh() {
  try {
    const jobs: Job[] = await api("jobs");
    const serial = JSON.stringify(jobs);
    if (previous === serial) return;
    previous = serial;
    $("#count").textContent = String(jobs.length);
    $("#zip").hidden = !jobs.some((j) => j.status === "complete");
    $("#jobs").innerHTML = jobs.length
      ? jobs
          .map(
            (j) =>
              `<article><div><strong>${esc(j.config.name)}</strong><p class="hint">${j.config.aspect} · ${j.config.logo ? `Logo part ${j.config.target + 1}` : `Target ${esc(analyze(j.config.name).chars[j.config.target])}`} · ${j.id.slice(0, 8)}</p></div><div class="job-state">${esc(j.status)}${j.status === "rendering" ? ` · ${j.frames}/${j.config.fps * j.config.duration}` : ""}</div>${["queued", "rendering", "encoding"].includes(j.status) ? `<button data-action="cancel" data-id="${j.id}">Cancel</button>` : j.status === "complete" ? `<a href="/api/download/${j.id}">Download</a>` : `<button data-action="retry" data-id="${j.id}">Retry</button>`}${j.status === "rendering" ? `<progress max="${j.config.fps * j.config.duration}" value="${j.frames}" aria-label="Captured frames"></progress>` : ""}${j.error ? `<p class="error">${esc(j.error)}</p>` : ""}</article>`,
          )
          .join("")
      : `<div class="empty">${icon("film")}<h3>No render jobs yet</h3><p>Export a scene or add batch names to get started.</p></div>`;
  } catch (e) {
    previous = "";
    $("#jobs").textContent = `Render service unavailable: ${e}`;
  }
}
$("#jobs").onclick = async (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b)
    try {
      await api(`jobs/${b.dataset.id}/${b.dataset.action}`, {});
      await refresh();
    } catch (e) {
      notice(String(e));
    }
};
$("#export").onclick = async () => {
  if (invalid) {
    showError = true;
    errorState();
    name.focus();
    return;
  }
  const b = $<HTMLButtonElement>("#export");
  b.disabled = true;
  try {
    const result = await api("jobs", { entries: [cfg] });
    if (result.errors.length) throw Error(result.errors[0].error);
    view(true);
    notice(`${cfg.name} added to the render queue.`);
  } catch (e) {
    notice(String(e));
  } finally {
    b.disabled = false;
  }
};
$("#enqueue").onclick = async () => {
  const batch = $<HTMLTextAreaElement>("#batch"),
    rows = batch.value.split(/\r?\n/),
    entries = [],
    errors = [],
    bad = [];
  for (const [i, row] of rows.entries()) {
    if (!row.trim()) continue;
    try {
      entries.push(
        snapshot({
          ...(logoMode
            ? {
                ...nameDraft.appearance,
                aspect: nameDraft.aspect,
                ending: nameDraft.ending,
              }
            : cfg),
          logo: undefined,
          name: row,
          target: undefined,
        }),
      );
    } catch (e) {
      errors.push(`Line ${i + 1}: ${(e as Error).message}`);
      bad.push(row);
    }
  }
  const b = $<HTMLButtonElement>("#enqueue");
  b.disabled = true;
  try {
    if (entries.length) {
      const r = await api("jobs", { entries });
      if (r.errors.length)
        throw Error(r.errors.map((e: { error: string }) => e.error).join("\n"));
      batch.value = bad.join("\n");
    }
    $("#batchMsg").textContent = [
      entries.length
        ? `Queued ${entries.length} film${entries.length === 1 ? "" : "s"}.`
        : errors.length
          ? "No films queued."
          : "Enter at least one name.",
      ...errors,
    ].join("\n");
    await refresh();
  } catch (e) {
    $("#batchMsg").textContent = String(e);
  } finally {
    b.disabled = false;
  }
};
update();
void refresh();
setInterval(() => void refresh(), 1500);
try {
  studio = studioScene(canvas);
  ready = true;
  update();
  await studio.warm();
  draw();
  $("#loading").hidden = true;
  new ResizeObserver(resize).observe($("#frame"));
} catch (e) {
  ready = false;
  $("#loading").textContent =
    `Preview unavailable. Enable WebGL 2 / graphics acceleration. ${e}`;
}
