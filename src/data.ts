import { validateFood, type FoodInput } from '../supabase/functions/_shared/food';
export type Entry = FoodInput & { id: string; user_id: string; created_at: string };
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const localInput = (date: Date) => `${dayKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export const totals = (entries: FoodInput[]) => entries.reduce((t,e) => ({ calories:t.calories+e.calories, protein:t.protein+Number(e.protein), carbs:t.carbs+Number(e.carbs), fat:t.fat+Number(e.fat) }), {calories:0,protein:0,carbs:0,fat:0});
export const formatNumber = (value: number) => new Intl.NumberFormat(undefined,{ maximumFractionDigits:1 }).format(value);
const guestKey = 'calorie-tracker-guest-food';
export function readGuestEntries(): Entry[] {
  const saved = JSON.parse(localStorage.getItem(guestKey) || '[]') as unknown;
  if (!Array.isArray(saved)) throw new Error('Could not read meals saved on this device.');
  return saved.map(value => {
    if (!value || typeof value !== 'object' || typeof (value as Entry).id !== 'string') throw new Error('Could not read meals saved on this device.');
    return { ...validateGuestFood(value), id:(value as Entry).id, user_id:'guest', created_at:(value as Entry).created_at };
  });
}
function validateGuestFood(value: unknown) {
  const {name,calories,protein,carbs,fat,notes,eaten_at,source} = value as Entry;
  return validateFood({name,calories,protein,carbs,fat,notes,eaten_at,source});
}
export function writeGuestEntries(entries: Entry[]) {
  localStorage.setItem(guestKey, JSON.stringify(entries));
}
export function barcodeFood(result:unknown,code:string,eaten_at:string){
  const root=result as {status?:number;product?:{product_name?:string;brands?:string;serving_size?:string;nutriments?:Record<string,unknown>}};
  if(root.status!==1)throw new Error('Product not found in Open Food Facts.');
  const product=root.product??{},nutriments=product.nutriments??{};
  const serving=['energy-kcal','proteins','carbohydrates','fat'].every(key=>nutriments[`${key}_serving`]!=null);
  const value=(key:string)=>Number(nutriments[`${key}_${serving?'serving':'100g'}`]);
  return {name:product.product_name||product.brands||`Product ${code}`,calories:Math.round(value('energy-kcal')),protein:value('proteins'),carbs:value('carbohydrates'),fat:value('fat'),notes:`Barcode ${code}; nutrition ${serving?(product.serving_size?`per ${product.serving_size}`:'per serving'):'per 100 g'} from Open Food Facts.`,eaten_at,source:'manual' as const};
}
