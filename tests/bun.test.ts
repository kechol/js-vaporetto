// @ts-nocheck — the suite is plain JS shared by all four runtimes.
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { Vaporetto, VAPORETTO_VERSION, JS_VAPORETTO_VERSION } from "../dist/node/vaporetto.js";
import { asserts, createSuite } from "./suite.mjs";

const read = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

const cases = createSuite({
  Vaporetto,
  model: read("tiny.model"),
  modelZst: read("tiny.model.zst"),
  vaporettoVersion: VAPORETTO_VERSION,
  jsVaporettoVersion: JS_VAPORETTO_VERSION,
});

for (const { name, fn } of cases) test(name, () => fn(asserts));

// See the comment in node.test.mjs: `using` is syntax, so probe by importing
// and skip rather than fail on engines without it.
let usingModule = null;
try {
  usingModule = await import("./using.mjs");
} catch {
  // engine does not support `using`
}

test.skipIf(!usingModule)("using releases the tokenizer on scope exit", () =>
  usingModule.usingReleasesOnScopeExit({ Vaporetto, model: read("tiny.model"), asserts }),
);
