import assert from "node:assert/strict";
import test from "node:test";
import {
  openGuest,
  readGuest,
  saveGuest,
  removeGuest,
  eraseGuest,
} from "../src/guest.ts";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});
const food = {
  name: "Breakfast",
  calories: 420,
  protein: 15,
  carbs: 50,
  fat: 18,
  eaten_at: "2026-11-03T08:00:00Z",
  notes: null,
  source: "manual" as const,
};

test("guest CRUD persists, validates ownership and isolates a new journal", () => {
  const id = openGuest();
  saveGuest(id, food);
  assert.equal(openGuest(), id);
  const [entry] = readGuest(id);
  assert.equal(entry.user_id, id);
  assert.equal(entry.name, "Breakfast");
  saveGuest(id, { ...food, name: "Updated" }, entry.id);
  assert.equal(readGuest(id)[0].name, "Updated");
  assert.throws(() => saveGuest(id, { ...food, calories: -1 }));
  assert.throws(() => saveGuest("other-user", food));
  assert.throws(() => saveGuest(id, food, "missing"));
  removeGuest(id, entry.id);
  assert.deepEqual(readGuest(id), []);
  saveGuest(id, food);
  eraseGuest();
  assert.throws(() => readGuest(id));
  const fresh = openGuest();
  assert.notEqual(fresh, id);
  assert.deepEqual(readGuest(fresh), []);
  assert.ok(![...values.values()].some((value) => value.includes("Breakfast")));
});

test("corrupt or foreign entries are never overwritten", () => {
  const id = openGuest(),
    key = `calorie-tracker:guest:v1:${id}`;
  const bad = JSON.stringify([
    { ...food, id: "bad", user_id: "someone-else", created_at: food.eaten_at },
  ]);
  localStorage.setItem(key, bad);
  assert.throws(() => openGuest());
  assert.throws(() => saveGuest(id, food));
  assert.equal(localStorage.getItem(key), bad);
  eraseGuest();
});

test("storage failures are reported rather than claiming a save", () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("Storage quota exceeded");
  };
  assert.throws(() => openGuest(), /Cannot open device storage/);
  localStorage.setItem = original;
});
