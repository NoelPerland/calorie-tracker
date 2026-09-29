import type { FoodInput } from '../supabase/functions/_shared/food';
export type Entry = FoodInput & { id: string; user_id: string; created_at: string };
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const localInput = (date: Date) => `${dayKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export const totals = (entries: FoodInput[]) => entries.reduce((t,e) => ({ calories:t.calories+e.calories, protein:t.protein+Number(e.protein), carbs:t.carbs+Number(e.carbs), fat:t.fat+Number(e.fat) }), {calories:0,protein:0,carbs:0,fat:0});
export const formatNumber = (value: number) => new Intl.NumberFormat(undefined,{ maximumFractionDigits:1 }).format(value);
