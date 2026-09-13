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
  assert.equal(innerBull.isDouble, true);
});

test("checkout suggestions include direct outer bull finishes", () => {
  assert.deepEqual(findCheckout(25, 1), ["25 / Outer Bull"]);
  assert.deepEqual(findCheckout(50, 1), ["D-Bull"]);
});

test("two-dart and three-dart checkouts still work", () => {
  assert.deepEqual(findCheckout(40, 1), ["D20"]);

  const checkout90 = findCheckout(90, 2);
  assert.ok(checkout90);
  assert.equal(checkout90.length, 2);
  assert.equal(checkout90[0].startsWith("T"), true);
  assert.equal(checkout90[1].startsWith("D"), true);

  const checkout170 = findCheckout(170, 3);
  assert.ok(checkout170);
  assert.equal(checkout170.length, 3);
  assert.deepEqual(checkout170[0], "T20");
  assert.deepEqual(checkout170[1], "T20");
  assert.deepEqual(checkout170[2], "D-Bull");
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

test("single dart cannot finish on a non-double or non-bull", () => {
  assert.equal(
    isBustThrow({ currentRemaining: 20, turnThrows: [], nextThrow: { label: "S20", value: 20 } }),
    true
  );
  assert.equal(
    isBustThrow({ currentRemaining: 25, turnThrows: [], nextThrow: { label: "25 / Outer Bull", value: 25 } }),
    false
  );
});

console.log("All scoring checks passed.");
