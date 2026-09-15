import assert from "node:assert/strict";
import { ALL_SEGMENTS, findCheckout, isBustThrow } from "../src/scoringEngine.js";

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const s20 = ALL_SEGMENTS.find((segment) => segment.label === "S20");
const d20 = ALL_SEGMENTS.find((segment) => segment.label === "D20");
const t20 = ALL_SEGMENTS.find((segment) => segment.label === "T20");
const outerBull = ALL_SEGMENTS.find((segment) => segment.label === "25 / Outer Bull");
const innerBull = ALL_SEGMENTS.find((segment) => segment.label === "D-Bull");

test("segment values are correct for 1-20", () => {
  assert.equal(s20.value, 20);
  assert.equal(d20.value, 40);
  assert.equal(t20.value, 60);
});

test("bull values are correct", () => {
  assert.equal(outerBull.value, 25);
  assert.equal(innerBull.value, 50);
  assert.equal(outerBull.isBull, true);
  assert.equal(innerBull.isDouble, true);
});

test("double-out checkout only accepts doubles or inner bull", () => {
  assert.equal(findCheckout(25, 1), null);
  assert.deepEqual(findCheckout(50, 1), ["D-Bull"]);
  assert.deepEqual(findCheckout(40, 1), ["D20"]);
  assert.deepEqual(findCheckout(14, 1), ["D7"]);
});

test("checkout ranking prefers simple professional routes", () => {
  assert.deepEqual(findCheckout(60, 2), ["S20", "D20"]);
  assert.deepEqual(findCheckout(100, 2), ["T20", "D20"]);
  assert.deepEqual(findCheckout(170, 3), ["T20", "T20", "D-Bull"]);
  assert.deepEqual(findCheckout(167, 3), ["T20", "T19", "D-Bull"]);
  assert.deepEqual(findCheckout(164, 3), ["T20", "T18", "D-Bull"]);
  assert.deepEqual(findCheckout(161, 3), ["T20", "T17", "D-Bull"]);
  assert.deepEqual(findCheckout(160, 3), ["T20", "T20", "D20"]);
  assert.deepEqual(findCheckout(158, 3), ["T20", "T20", "D19"]);
  assert.deepEqual(findCheckout(157, 3), ["T20", "T19", "D20"]);
  assert.deepEqual(findCheckout(147, 3), ["T20", "T17", "D18"]);
});

test("one dart route is preferred when available", () => {
  assert.deepEqual(findCheckout(32, 3), ["D16"]);
  assert.deepEqual(findCheckout(50, 3), ["D-Bull"]);
  assert.deepEqual(findCheckout(100, 3), ["T20", "D20"]);
});

test("known impossible three-dart checkouts return no route", () => {
  for (const score of [159, 162, 163, 165, 166, 168, 169]) {
    assert.equal(findCheckout(score, 3), null, `expected ${score} to be impossible`);
  }
});

test("busts are detected for less than zero and exact one", () => {
  assert.equal(
    isBustThrow({ currentRemaining: 40, turnThrows: [{ label: "T20", value: 60 }], nextThrow: { label: "D20", value: 40 } }),
    true
  );
  assert.equal(
    isBustThrow({ currentRemaining: 41, turnThrows: [], nextThrow: { label: "S20", value: 20 } }),
    false
  );
  assert.equal(
    isBustThrow({ currentRemaining: 41, turnThrows: [], nextThrow: { label: "T20", value: 60 } }),
    true
  );
});

test("double-out rejects an outer bull finish", () => {
  assert.equal(
    isBustThrow({ currentRemaining: 25, turnThrows: [], nextThrow: { label: "25 / Outer Bull", value: 25, isBull: true } }),
    true
  );
});

test("single dart cannot finish on a plain single", () => {
  assert.equal(
    isBustThrow({ currentRemaining: 20, turnThrows: [], nextThrow: { label: "S20", value: 20 } }),
    true
  );
});

console.log("All scoring checks passed.");
