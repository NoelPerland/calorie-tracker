export type FoodInput = { name: string; calories: number; protein: number; carbs: number; fat: number; notes: string | null; eaten_at: string; source: 'manual' | 'chat' };
export function validateFood(value: unknown): FoodInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a food entry object.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['name','calories','protein','carbs','fat','notes','eaten_at','source'].includes(k))) throw new Error('Unknown entry field.');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 200) throw new Error('Name must contain 1–200 characters.');
  for (const key of ['calories','protein','carbs','fat']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > 100000) throw new Error(`${key} must be a number between 0 and 100,000.`);
  }
  if (!Number.isInteger(v.calories)) throw new Error('Calories must be a whole number.');
  if (v.notes != null && (typeof v.notes !== 'string' || v.notes.length > 2000)) throw new Error('Notes must be under 2,000 characters.');
  if (typeof v.eaten_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v.eaten_at) || !Number.isFinite(Date.parse(v.eaten_at))) throw new Error('Date/time must be an ISO timestamp with a timezone.');
  const [year,month,day] = v.eaten_at.slice(0,10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year,month,0)).getUTCDate();
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth || Number(v.eaten_at.slice(11,13)) > 23) throw new Error('Date/time must be a real calendar date.');
  if (v.source !== undefined && v.source !== 'manual' && v.source !== 'chat') throw new Error('Source must be manual or chat.');
  return { name: v.name.trim(), calories: v.calories as number, protein: v.protein as number, carbs: v.carbs as number, fat: v.fat as number, notes: (v.notes as string | null | undefined)?.trim() || null, eaten_at: new Date(v.eaten_at).toISOString(), source: v.source ?? 'manual' } as FoodInput;
}
