import { randomUUID } from "node:crypto";
import { snapshot } from "../src/config.mjs";
export function queue(work) {
  const jobs = [];
  let current = null;
  async function pump() {
    if (current) return;
    const job = jobs.find((j) => j.status === "queued");
    if (!job) return;
    const controller = new AbortController();
    current = { job, controller };
    job.status = "rendering";
    try {
      await work(job, controller.signal);
      job.status = "complete";
    } catch (e) {
      job.status = controller.signal.aborted ? "canceled" : "failed";
      if (job.status === "failed") job.error = e.message;
    } finally {
      current = null;
      queueMicrotask(pump);
    }
  }
  function add(input) {
    const config = snapshot(input),
      id = randomUUID();
    const slug =
      config.name
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "name";
    const job = {
      id,
      config,
      file: `${slug}-${id}.mp4`,
      status: "queued",
      frames: 0,
      error: null,
    };
    jobs.push(job);
    queueMicrotask(pump);
    return job;
  }
  function cancel(j) {
    if (j.status === "queued") j.status = "canceled";
    else if (current?.job === j) current.controller.abort();
    else throw Error("Job is not active.");
  }
  function retry(j) {
    if (!["failed", "canceled"].includes(j.status))
      throw Error("Only failed or canceled jobs can be retried.");
    j.status = "queued";
    j.frames = 0;
    j.error = null;
    queueMicrotask(pump);
  }
  return { jobs, add, cancel, retry };
}
