import assert from "node:assert/strict";
import { closingTime, dateInZone, wholeAmount } from "../src/helpers.js";

for (const value of ["1250.75", "-1250", "1,25", "1e3", "Infinity", "NaN", "0", "", "9007199254740992"]) {
  assert.ok(Number.isNaN(wholeAmount(value)), `Reject without rewriting: ${value}`);
}
assert.equal(wholeAmount("1,250"), 1250);
assert.equal(wholeAmount(" 1250 "), 1250);
assert.equal(closingTime("2026-12-15", "Africa/Lagos"), Date.parse("2026-12-15T16:00:00Z"));
assert.equal(closingTime("2026-12-15", "America/New_York"), Date.parse("2026-12-15T22:00:00Z"));
assert.equal(closingTime("2026-06-15", "America/New_York"), Date.parse("2026-06-15T21:00:00Z"));
assert.equal(dateInZone(Date.parse("2026-12-15T23:30:00Z"), "Africa/Lagos"), "2026-12-16");
assert.equal(closingTime(""), 0);
console.log("16 amount and time-zone regression checks passed.");
