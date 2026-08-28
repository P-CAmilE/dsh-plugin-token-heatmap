import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_COLORS, glyphColorFor, levelsFor } from "../src/client/palette.ts";

test("LEVEL_COLORS has 5 entries with #396BE2 deepest", () => {
  assert.equal(LEVEL_COLORS.length, 5);
  assert.equal(LEVEL_COLORS[4], "#396BE2");
});

test("all-zero data maps everything to level 0", () => {
  const levelOf = levelsFor([0, 0, 0]);
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(5), 0);
});

test("single non-zero value maps to middle level 3", () => {
  const levelOf = levelsFor([0, 5, 0]);
  assert.equal(levelOf(5), 3);
  assert.equal(levelOf(0), 0);
});

test("quartile mapping with boundary values to higher bucket", () => {
  // 1,2,3,4 → q25=1, q50=2, q75=3
  const levelOf = levelsFor([1, 2, 3, 4]);
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(1), 2); // >= q25
  assert.equal(levelOf(2), 3); // >= q50
  assert.equal(levelOf(3), 4); // >= q75
  assert.equal(levelOf(4), 4);
});

test("glyph color keeps icon visible on every level background", () => {
  // L0 骨架底色随主题反转 → 字形跟主题文字色；L1/L2 浅蓝 → 深色；L3/L4 → 白色
  assert.equal(glyphColorFor(0), "var(--dsw-alias-label-primary)");
  assert.equal(glyphColorFor(1), "#25407A");
  assert.equal(glyphColorFor(2), "#25407A");
  assert.equal(glyphColorFor(3), "rgba(255,255,255,0.95)");
  assert.equal(glyphColorFor(4), "rgba(255,255,255,0.95)");
});
