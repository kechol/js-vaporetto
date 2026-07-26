// Runs tests/suite.mjs on Cloudflare Workers by starting `wrangler dev` in
// local mode (workerd) and fetching the Worker in tests/workers/worker.mjs.
//
// That the "workerd" export condition points at the right target is checked in
// tests/exports.test.mjs, which needs neither wrangler nor workerd.
import { fileURLToPath } from "node:url";
import { report } from "../report.mjs";
import { withWranglerDev } from "./dev-server.mjs";

const results = await withWranglerDev(fileURLToPath(new URL(".", import.meta.url)), (r) => r.json());

process.exit(report("workers", results) === 0 ? 0 : 1);
