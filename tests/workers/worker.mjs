// Runs tests/suite.mjs inside workerd and returns the results as JSON.
// tests/workers/run.mjs starts this with `wrangler dev` and fetches it.
//
// The model fixtures arrive as ArrayBuffers because wrangler.jsonc declares a
// Data rule for them — the same shape a real Worker gets from an R2 or KV
// binding, which is how a model has to reach a Worker anyway.
//
// Unlike the other runtime entries this one has no `using` case. `using` is
// syntax, so on the other runtimes it is probed with a dynamic import that
// fails at call time on engines without it. Here the bundler resolves that
// import at build time, so unsupported syntax would break the build instead of
// being skippable. The library itself never uses `using`; it only provides
// [Symbol.dispose], which the suite already covers.
import { Vaporetto, VAPORETTO_VERSION, JS_VAPORETTO_VERSION } from "../../dist/workers/vaporetto.js";
import model from "../fixtures/tiny.model";
import modelZst from "../fixtures/tiny.model.zst";
import { createSuite, runCases } from "../suite.mjs";

export default {
  fetch() {
    const cases = createSuite({
      Vaporetto,
      model: new Uint8Array(model),
      modelZst: new Uint8Array(modelZst),
      vaporettoVersion: VAPORETTO_VERSION,
      jsVaporettoVersion: JS_VAPORETTO_VERSION,
    });

    return Response.json(runCases(cases));
  },
};
