// Runs a Worker out of a directory that installed js-vaporetto as a package,
// and checks it tokenizes. Used by the "install from git" CI job.
//
// This is the only check that exercises the Workers entry through package
// resolution: dist/workers imports ../web/js_vaporetto_bg.wasm, so both the
// packed tarball keeping that file and Wrangler resolving it from inside
// node_modules have to hold. The in-repo test imports dist/ by relative path
// and would not notice either breaking.
//
// Usage: node tests/workers/consumer-check.mjs <directory>
import { withWranglerDev } from "./dev-server.mjs";

const EXPECTED = "今 深海 魚 を 数え た ところ だ";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tests/workers/consumer-check.mjs <directory>");
  process.exit(1);
}

const got = (await withWranglerDev(dir, (r) => r.text())).trim();
if (got !== EXPECTED) {
  console.error(`the installed package tokenized to "${got}", expected "${EXPECTED}"`);
  process.exit(1);
}
console.log(`workers consumer ok: ${got}`);
