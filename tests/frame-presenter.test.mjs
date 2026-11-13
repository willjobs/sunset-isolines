import { test } from "node:test";
import assert from "node:assert/strict";
import { createFramePresenter } from "../src/frame-presenter.js";
function gate() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
test("keeps the old complete frame until preparation and commit finish", async () => {
  const ready = gate(),
    painted = gate();
  let visible = "March 7",
    done = false;
  const present = createFramePresenter(
    async (date) => {
      await ready.promise;
      return date;
    },
    async (date) => {
      await painted.promise;
      visible = date;
    },
  );
  const work = present("March 8", () => true).then((value) => {
    done = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(visible, "March 7");
  assert.equal(done, false);
  ready.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(visible, "March 7");
  assert.equal(done, false);
  painted.resolve();
  assert.equal(await work, true);
  assert.equal(visible, "March 8");
});
test("serializes rendering and skips outdated scrub requests", async () => {
  const ready = gate();
  let revision = 1;
  const prepared = [],
    committed = [];
  const present = createFramePresenter(
    async (frame) => {
      prepared.push(frame);
      if (frame === 1) await ready.promise;
      return frame;
    },
    (frame) => committed.push(frame),
  );
  const first = present(1, () => revision === 1);
  await Promise.resolve();
  revision = 2;
  const second = present(2, () => revision === 2);
  revision = 3;
  const third = present(3, () => revision === 3);
  ready.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [
    false,
    false,
    true,
  ]);
  assert.deepEqual(prepared, [1, 3]);
  assert.deepEqual(committed, [3]);
});
