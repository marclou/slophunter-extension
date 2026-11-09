import assert from "node:assert/strict";
import { test } from "node:test";
import "../src/shared.js";

const { SH } = globalThis;
const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

test("bullets: counts reloads that already happened", () => {
  const bullets = { remaining: 7, max: 10, reloadsAt: [at(-5), at(12), at(40)] };
  assert.deepEqual(SH.bulletsNow(bullets, NOW), { left: 8, max: 10, next: NOW + 12 * 60_000 });
});

test("bullets: full and empty", () => {
  assert.deepEqual(SH.bulletsNow({ remaining: 10, max: 10, reloadsAt: [] }, NOW), { left: 10, max: 10, next: null });
  const empty = SH.bulletsNow({ remaining: 0, max: 10, reloadsAt: Array.from({ length: 10 }, (_, i) => at(i + 1)) }, NOW);
  assert.equal(empty.left, 0);
  assert.equal(empty.next, NOW + 60_000);
});

test("bullets: never above max, safe without data", () => {
  assert.equal(SH.bulletsNow({ remaining: 10, max: 10, reloadsAt: [at(-1)] }, NOW).left, 10);
  assert.deepEqual(SH.bulletsNow(undefined, NOW), { left: 0, max: 10, next: null });
});

test("wait times", () => {
  assert.equal(SH.formatWait(10_000), "1m");
  assert.equal(SH.formatWait(42 * 60_000), "42m");
  assert.equal(SH.formatWait(60 * 60_000), "60m");
  assert.equal(SH.formatWait(95 * 60_000), "1h35");
});

test("money", () => {
  assert.equal(SH.formatMoney(0), "$0.00");
  assert.equal(SH.formatMoney(1240), "$12.40");
  assert.equal(SH.formatMoney(12_840_00), "$12,840");
});
