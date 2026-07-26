// Serves the repository root over HTTP and runs tests/suite.mjs in a real
// browser against the `web` target. `wasm-pack test --headless` would need a
// separate chromedriver install; Playwright is already a devDependency.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { report } from "../report.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

const server = createServer(async (req, res) => {
  // normalize() collapses any ../ so a request cannot escape ROOT
  const path = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browsers = { chromium, firefox, webkit };
const requested = process.argv.slice(2).filter((a) => a in browsers);
const names = requested.length > 0 ? requested : ["chromium"];

let failed = 0;
for (const name of names) {
  const browser = await browsers[name].launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(`  pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/tests/browser/index.html`);
  await page.waitForFunction(() => document.title === "done", null, { timeout: 60_000 });
  const results = await page.evaluate(() => globalThis.__results);
  await browser.close();

  failed += report(name, results);
}

server.close();
process.exit(failed === 0 ? 0 : 1);
