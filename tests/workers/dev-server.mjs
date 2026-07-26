// Starts `wrangler dev` in local mode (workerd) and waits until it answers.
//
// Shared by tests/workers/run.mjs and tests/workers/consumer-check.mjs so the
// startup timeout and the crash handling exist once. The CI step that checks
// the packed tarball used to reimplement this in bash with a different
// timeout, which is exactly the drift this avoids.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const START_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

/** The consumer project has its own wrangler; this repository's is at the root. */
function wranglerBin(cwd) {
  const candidates = [
    new URL("node_modules/.bin/wrangler", pathToFileURL(`${cwd}/`)),
    new URL("../../node_modules/.bin/wrangler", import.meta.url),
  ].map(fileURLToPath);
  return candidates.find(existsSync) ?? "wrangler";
}

async function freePort() {
  return await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Fetches `/` from a Worker served out of `cwd` and hands the response to
 * `body`, then stops the server. Throws with wrangler's output attached if it
 * never becomes reachable.
 *
 * @param {string} cwd directory holding wrangler.jsonc
 * @param {(response: Response) => Promise<any>} body
 */
export async function withWranglerDev(dir, body) {
  const cwd = resolve(dir);
  const port = await freePort();
  const wrangler = spawn(
    wranglerBin(cwd),
    ["dev", "--local", "--port", String(port), "--ip", "127.0.0.1"],
    {
      cwd,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );

  // Chunks rather than a growing string: the log is only read when something
  // goes wrong, and a dev server left running would concatenate forever.
  const chunks = [];
  wrangler.stdout.on("data", (b) => chunks.push(b));
  wrangler.stderr.on("data", (b) => chunks.push(b));
  const withLog = (message) =>
    new Error(`${message}\n--- wrangler output ---\n${Buffer.concat(chunks).toString().trim()}`);

  try {
    const deadline = Date.now() + START_TIMEOUT_MS;
    let response = null;
    while (response === null) {
      // exitCode is null until the process ends, so this catches a wrangler
      // that died during startup instead of waiting out the whole timeout.
      if (wrangler.exitCode !== null || wrangler.signalCode !== null) {
        throw withLog(`wrangler dev exited (${wrangler.exitCode ?? wrangler.signalCode}) before serving a request`);
      }
      if (Date.now() > deadline) throw withLog(`wrangler dev did not answer within ${START_TIMEOUT_MS} ms`);
      // Connection refused until the server is up; anything else surfaces as a
      // failing status below.
      response = await fetch(`http://127.0.0.1:${port}/`).catch(() => null);
      if (response === null) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (!response.ok) throw withLog(`the Worker answered ${response.status}`);
    return await body(response);
  } finally {
    wrangler.kill();
  }
}
