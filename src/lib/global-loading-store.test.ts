import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptiveProgress, createLoadingStore } from "./global-loading-store.ts";

test("overlapping work cannot release another operation and release is idempotent", () => {
  const store = createLoadingStore();
  const samples: number[] = [];
  const unsubscribe = store.subscribe(() => samples.push(store.getSnapshot()));
  const first = store.begin();
  const second = store.begin();
  first();
  first();
  assert.equal(store.getSnapshot(), 1);
  second();
  assert.equal(store.getSnapshot(), 0);
  assert.deepEqual(samples, [1, 2, 1, 0]);
  unsubscribe();
  store.begin()();
  assert.equal(samples.length, 4);
});

test("a new operation during completion restores pending immediately", () => {
  const store = createLoadingStore();
  store.begin()();
  const finish = store.begin();
  assert.equal(store.getSnapshot(), 1);
  finish();
  assert.equal(store.getSnapshot(), 0);
});

test("adaptive progress is monotonic, continuous at phase boundaries and never complete", () => {
  let previous = 0;
  for (let time = 0; time <= 3600000; time += 10) {
    const progress = adaptiveProgress(time);
    assert.ok(progress >= previous && progress <= 95);
    previous = progress;
  }
  assert.equal(adaptiveProgress(-1), 0);
  assert.equal(adaptiveProgress(700), 55);
  assert.equal(adaptiveProgress(2200), 80);
  assert.ok(adaptiveProgress(20000) < 95);
});
