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

test("using releases the tokenizer on scope exit", async () => {
  const { usingReleasesOnScopeExit } = await import("./using.mjs");
  usingReleasesOnScopeExit({ Vaporetto, model: read("tiny.model"), asserts });
});
