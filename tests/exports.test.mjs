// Every other test imports dist/<target>/vaporetto.js by relative path, so
// nothing else would notice if the "exports" map sent a runtime to the wrong
// target — and a wrong target is not a subtle failure: the bundler glue cannot
// initialize on workerd or Bun at all.
//
// Node applies --conditions on top of its own, and resolves a package by its
// own name, so each runtime's condition can be checked here without installing
// that runtime. Order matters as much as presence: conditions are matched in
// the order they appear in the map, which is why "workerd" has to sit above
// "browser" (Wrangler asks for workerd, worker and browser, in that order).
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);

const CASES = [
  ["workerd", "dist/workers/vaporetto.js"], // Cloudflare Workers, via Wrangler
  ["deno", "dist/deno/vaporetto.js"],
  ["bun", "dist/node/vaporetto.js"], // see "Why bun points at the Node target"
  ["browser", "dist/bundler/vaporetto.js"], // bundlers targeting the browser
  ["node", "dist/node/vaporetto.js"], // Node applies this one on its own
];

const resolveWith = (condition) =>
  execFileSync(
    process.execPath,
    [
      "--conditions",
      condition,
      "--input-type=module",
      "-e",
      'process.stdout.write(import.meta.resolve("js-vaporetto"))',
    ],
    { cwd: fileURLToPath(ROOT), encoding: "utf8" },
  );

for (const [condition, target] of CASES) {
  test(`the "${condition}" condition resolves to ${target}`, (t) => {
    t.assert.strictEqual(resolveWith(condition), new URL(target, ROOT).href);
  });
}
