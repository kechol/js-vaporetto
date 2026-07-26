// @ts-nocheck — the suite is plain JS shared by all four runtimes.
import { Vaporetto, VAPORETTO_VERSION, JS_VAPORETTO_VERSION } from "../dist/deno/vaporetto.js";
import { asserts, createSuite } from "./suite.mjs";

const read = async (name: string) =>
  await Deno.readFile(new URL(`./fixtures/${name}`, import.meta.url));

const cases = createSuite({
  Vaporetto,
  model: await read("tiny.model"),
  modelZst: await read("tiny.model.zst"),
  vaporettoVersion: VAPORETTO_VERSION,
  jsVaporettoVersion: JS_VAPORETTO_VERSION,
});

for (const { name, fn } of cases) {
  Deno.test(name, () => fn(asserts));
}

// See the comment in node.test.mjs: `using` is syntax, so probe by importing
// and skip rather than fail on engines without it. Only swallow the
// SyntaxError unsupported syntax produces, not an unrelated real failure.
let usingModule = null;
try {
  usingModule = await import("./using.mjs");
} catch (e) {
  if (!(e instanceof SyntaxError)) throw e;
  // engine does not support `using`
}

Deno.test({
  name: "using releases the tokenizer on scope exit",
  ignore: !usingModule,
  fn: async () =>
    usingModule.usingReleasesOnScopeExit({ Vaporetto, model: await read("tiny.model"), asserts }),
});
