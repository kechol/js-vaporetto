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

Deno.test("using releases the tokenizer on scope exit", async () => {
  const { usingReleasesOnScopeExit } = await import("./using.mjs");
  usingReleasesOnScopeExit({ Vaporetto, model: await read("tiny.model"), asserts });
});
