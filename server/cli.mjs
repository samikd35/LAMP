import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { snapshot } from "../src/config.mjs";
try {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      aspect: { type: "string" },
      list: { type: "string" },
      target: { type: "string" },
      ending: { type: "string" },
      lamp: { type: "string" },
      text: { type: "string" },
      background: { type: "string" },
    },
  });
  const names = [
    ...positionals,
    ...(v.list ? (await readFile(v.list, "utf8")).split(/\r?\n/) : []),
  ];
  if (!names.length)
    throw Error(
      "Usage: npm run export -- --aspect landscape SAMUEL or --list names.txt",
    );
  if (names.filter((n) => n.trim()).length > 1 && v.target)
    throw Error("Manual target is for single exports only.");
  const origin = `http://127.0.0.1:${process.env.PORT ?? 4173}`;
  const entries = [];
  for (const [i, name] of names.entries()) {
    if (!name.trim() && i >= positionals.length) continue;
    try {
      entries.push(
        snapshot({
          ...v,
          name,
          target: v.target === undefined ? undefined : Number(v.target) - 1,
        }),
      );
    } catch (e) {
      console.error(`Row ${i + 1}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  if (!entries.length) throw Error("No valid names to render.");
  const r = await fetch(origin + "/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const { ids, errors, error } = await r.json();
  if (error || errors?.length) throw Error(error ?? JSON.stringify(errors));
  let last = "";
  while (true) {
    const jobs = (await (await fetch(origin + "/api/jobs")).json()).filter(
      (j) => ids.includes(j.id),
    );
    if (jobs.length !== ids.length)
      throw Error(
        "Queue changed while waiting. Check whether the studio service restarted.",
      );
    const msg = jobs
      .map(
        (j) =>
          `${j.config.name}: ${j.status} ${j.frames}/${j.config.duration * j.config.fps}${j.error ? " " + j.error : ""}${j.status === "complete" ? " outputs/" + j.file : ""}`,
      )
      .join("\n");
    if (last !== msg) console.log(msg);
    last = msg;
    if (
      jobs.every((j) => ["complete", "failed", "canceled"].includes(j.status))
    ) {
      if (jobs.some((j) => j.status !== "complete")) process.exitCode = 1;
      break;
    }
    await setTimeout(1500);
  }
} catch (e) {
  console.error(
    e.message === "fetch failed"
      ? "Local service unavailable. Start npm start first."
      : e.message,
  );
  process.exitCode = 1;
}
