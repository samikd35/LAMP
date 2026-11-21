import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { queue } from "./queue.mjs";
import { render } from "./worker.mjs";
import { logoRasterLimit } from "../src/config.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dir = path.join(root, "outputs"),
  dist = path.join(root, "dist"),
  port = Number(process.env.PORT ?? 4173),
  origin = `http://127.0.0.1:${port}`,
  maxJobBody = 4 * Math.ceil((4 * logoRasterLimit ** 2) / 3) + 65536;
const q = queue((j, signal) => render(j, { dir, origin, signal }));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};
async function sendFile(res, file, attachment) {
  const s = await stat(file);
  if (!s.isFile()) throw Error("Not a file.");
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
    "Content-Length": s.size,
    ...(attachment && {
      "Content-Disposition": `attachment; filename="${path.basename(file)}"`,
    }),
  });
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}
const server = http.createServer(async (req, res) => {
  const json = (code, v) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(v));
  };
  try {
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`)
    )
      return json(403, { error: "Only local studio requests are accepted." });
    const u = new URL(req.url, origin).pathname;
    if (req.method === "POST") {
      if (req.headers["content-type"] !== "application/json")
        return json(415, { error: "Expected JSON." });
      let body = "";
      req.setEncoding("utf8");
      for await (const chunk of req) {
        body += chunk;
        if (body.length > maxJobBody)
          return json(413, { error: "Split the batch into smaller lists." });
      }
      const b = JSON.parse(body || "{}");
      if (u === "/api/jobs") {
        if (!Array.isArray(b.entries) || b.entries.length > 250)
          throw Error("Submit up to 250 names at once.");
        const ids = [],
          errors = [];
        for (const [row, item] of b.entries.entries())
          try {
            ids.push(q.add(item).id);
          } catch (e) {
            errors.push({ row: row + 1, error: e.message });
          }
        return json(200, { ids, errors });
      }
      const m = u.match(/^\/api\/jobs\/([\da-f-]+)\/(retry|cancel)$/),
        j = m && q.jobs.find((j) => j.id === m[1]);
      if (j) {
        q[m[2]](j);
        return json(200, { ok: true });
      }
    }
    if (req.method !== "GET") return json(404, { error: "Unknown command." });
    if (u === "/api/jobs")
      return json(
        200,
        q.jobs.map((j) =>
          j.config.logo
            ? {
                ...j,
                config: {
                  ...j.config,
                  logo: "svg" in j.config.logo
                    ? { format: "svg" }
                    : { w: j.config.logo.w, h: j.config.logo.h },
                },
              }
            : j,
        ),
      );
    if (u === "/api/collection.zip") {
      const list = structuredClone(q.jobs);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="lamp-studio.zip"',
      });
      const zip = new Zip((err, data, final) => {
        if (err) throw err;
        res.write(data);
        if (final) res.end();
      });
      const man = new ZipPassThrough("manifest.json");
      zip.add(man);
      man.push(strToU8(JSON.stringify(list, null, 2)), true);
      const closed = new AbortController();
      res.once("close", () => closed.abort());
      for (const j of list.filter((j) => j.status === "complete")) {
        const f = new ZipPassThrough(j.file);
        zip.add(f);
        for await (const chunk of createReadStream(path.join(dir, j.file))) {
          if (res.destroyed) return;
          f.push(chunk);
          if (res.writableNeedDrain)
            await once(res, "drain", { signal: closed.signal });
        }
        f.push(new Uint8Array(), true);
      }
      zip.end();
      return;
    }
    if (u.startsWith("/api/download/")) {
      const j = q.jobs.find(
        (j) => j.id === u.split("/").pop() && j.status === "complete",
      );
      if (!j) return json(404, { error: "Video is not complete." });
      return await sendFile(res, path.join(dir, j.file), true);
    }
    const file = path.resolve(
      dist,
      "." + decodeURIComponent(u === "/" ? "/index.html" : u),
    );
    if (!file.startsWith(dist + path.sep))
      return json(403, { error: "Invalid path." });
    return await sendFile(res, file, false);
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(e.code === "ENOENT" ? 404 : 400, { error: e.message });
  }
});

async function studioIsRunning() {
  // Check both routes so a static preview of the editor does not qualify.
  const options = { signal: AbortSignal.timeout(1500), redirect: "error" };
  try {
    const editor = await fetch(origin + "/studio.html", options);
    if (!editor.ok || !(await editor.text()).includes("<title>Lamp Name Studio</title>"))
      return false;
    const jobs = await fetch(`${origin}/api/jobs`, options);
    await jobs.body?.cancel();
    return jobs.ok && jobs.headers.get("content-type") === "application/json";
  } catch {
    return false;
  }
}

try {
  await once(server.listen(port, "127.0.0.1"), "listening");
  console.log(`Lamp Name Studio: ${origin}`);
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => {
      for (const j of q.jobs.filter((j) =>
        ["queued", "rendering", "encoding"].includes(j.status),
      ))
        q.cancel(j);
      server.close();
    });
} catch (error) {
  if (error.code !== "EADDRINUSE") throw error;
  if (process.argv.includes("--reuse") && await studioIsRunning()) {
    console.log(`Lamp Name Studio is already running at ${origin}`);
  } else {
    console.error(`${origin} is already in use. Set PORT to a free port and try again.`);
    process.exitCode = 1;
  }
}
