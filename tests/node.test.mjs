import { test } from "node:test";
import { readFileSync } from "node:fs";
import { Vaporetto, VAPORETTO_VERSION, JS_VAPORETTO_VERSION } from "../dist/node/vaporetto.js";
import { asserts, createSuite } from "./suite.mjs";

const read = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

const cases = createSuite({
  Vaporetto,
  model: read("tiny.model"),
  modelZst: read("tiny.model.zst"),
  vaporettoVersion: VAPORETTO_VERSION,
  jsVaporettoVersion: JS_VAPORETTO_VERSION,
});

for (const { name, fn } of cases) test(name, () => fn(asserts));

// `using` is syntax, so an engine without explicit resource management fails to
// parse the module rather than failing at the call. Probe by importing, and
// skip rather than fail — Node only gained support in 24, and the library
// itself works fine without it.
let usingModule = null;
try {
  usingModule = await import("./using.mjs");
} catch {
  // engine does not support `using`
}

test(
  "using releases the tokenizer on scope exit",
  { skip: usingModule ? false : "engine does not support `using` (Node 24+ required)" },
  () => usingModule.usingReleasesOnScopeExit({ Vaporetto, model: read("tiny.model"), asserts }),
);
