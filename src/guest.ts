import {
  validateFood,
  type FoodInput,
} from "../supabase/functions/_shared/food";
import type { Entry } from "./data";

const pointer = "calorie-tracker:guest:v1";
const key = (id: string) => `${pointer}:${id}`;
function assertOwner(id: string) {
  if (localStorage.getItem(pointer) !== id)
    throw new Error(
      "This device journal was ended in another tab. Reopen guest mode.",
    );
}
export function openGuest(): string {
  try {
    const existing = localStorage.getItem(pointer);
    if (existing) {
      readGuest(existing);
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(key(id), "[]");
    localStorage.setItem(pointer, id);
    return id;
  } catch (error) {
    throw new Error(
      `Cannot open device storage. ${error instanceof Error ? error.message : "Check your browser settings."}`,
    );
  }
}
export function readGuest(id: string): Entry[] {
  assertOwner(id);
  const raw = localStorage.getItem(key(id));
  if (raw === null)
    throw new Error(
      "Device journal is missing. Restore browser storage or erase this journal to start again.",
    );
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values))
    throw new Error(
      "Device journal is unreadable. It has not been overwritten.",
    );
  return values
    .map((value) => {
      if (!value || typeof value !== "object")
        throw new Error("Invalid device entry.");
      const { id: entryId, user_id, created_at, ...food } = value;
      if (
        typeof entryId !== "string" ||
        user_id !== id ||
        typeof created_at !== "string" ||
        !Number.isFinite(Date.parse(created_at))
      )
        throw new Error("Invalid device entry ownership.");
      return { ...validateFood(food), id: entryId, user_id, created_at };
    })
    .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
}
export function saveGuest(id: string, input: FoodInput, entryId?: string) {
  const food = validateFood(input);
  const entries = readGuest(id);
  if (entryId && !entries.some((entry) => entry.id === entryId))
    throw new Error("This meal no longer exists. Reload your journal.");
  const next = entryId
    ? entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...food } : entry,
      )
    : [
        ...entries,
        {
          ...food,
          id: crypto.randomUUID(),
          user_id: id,
          created_at: new Date().toISOString(),
        },
      ];
  localStorage.setItem(key(id), JSON.stringify(next));
}
export function removeGuest(id: string, entryId: string) {
  localStorage.setItem(
    key(id),
    JSON.stringify(readGuest(id).filter((entry) => entry.id !== entryId)),
  );
}
export function eraseGuest() {
  const id = localStorage.getItem(pointer);
  if (id) localStorage.removeItem(key(id));
  localStorage.removeItem(pointer);
}
