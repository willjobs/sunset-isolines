import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFrame, BAND_SCHEMA } from "../src/frame-data.js";
test("rejects a cached five-band frame even when its GeoJSON is valid", () => {
  assert.throws(
    () =>
      validateFrame({ type: "FeatureCollection", bandSchema: 3, features: [] }),
    /current six-band/,
  );
  assert.throws(
    () => validateFrame({ type: "FeatureCollection", features: [] }),
    /current six-band/,
  );
});
test("accepts valid empty frames for the current schema", () => {
  const frame = {
    type: "FeatureCollection",
    bandSchema: BAND_SCHEMA,
    features: [],
  };
  assert.equal(validateFrame(frame), frame);
});
