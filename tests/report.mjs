// Result reporting for the runtimes whose suite runs out of process — the
// browser page and the Worker. Both hand back the array runCases() produced in
// tests/suite.mjs, and both want the same thing printed for it.

/**
 * @param {string} label                                   runtime being reported
 * @param {Array<{name: string, ok: boolean, error?: string}>} results
 * @returns {number} cases that failed; an empty run counts as one failure
 *   rather than a pass, so a harness that silently loaded nothing is not
 *   reported as "0/0 passed".
 */
export function report(label, results) {
  const bad = results.filter((r) => !r.ok);
  for (const r of bad) console.error(`  FAIL ${label}: ${r.name}\n       ${r.error}`);
  if (results.length === 0) {
    console.error(`${label}: the suite reported no cases at all`);
    return 1;
  }
  console.log(`${label}: ${results.length - bad.length}/${results.length} passed`);
  return bad.length;
}
