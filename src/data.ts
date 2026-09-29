import type { FoodInput } from '../supabase/functions/_shared/food';
export type Entry = FoodInput & { id: string; user_id: string; created_at: string };
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const localInput = (date: Date) => `${dayKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export const totals = (entries: FoodInput[]) => entries.reduce((t,e) => ({ calories:t.calories+e.calories, protein:t.protein+Number(e.protein), carbs:t.carbs+Number(e.carbs), fat:t.fat+Number(e.fat) }), {calories:0,protein:0,carbs:0,fat:0});
export const formatNumber = (value: number) => new Intl.NumberFormat(undefined,{ maximumFractionDigits:1 }).format(value);
export function barcodeFood(result:unknown,code:string,eaten_at:string){
  const root=result as {status?:number;product?:{product_name?:string;brands?:string;serving_size?:string;nutriments?:Record<string,unknown>}};
  if(root.status!==1)throw new Error('Product not found in Open Food Facts.');
  const product=root.product??{},nutriments=product.nutriments??{};
  const serving=['energy-kcal','proteins','carbohydrates','fat'].every(key=>nutriments[`${key}_serving`]!=null);
  const value=(key:string)=>Number(nutriments[`${key}_${serving?'serving':'100g'}`]);
  return {name:product.product_name||product.brands||`Product ${code}`,calories:Math.round(value('energy-kcal')),protein:value('proteins'),carbs:value('carbohydrates'),fat:value('fat'),notes:`Barcode ${code}; nutrition ${serving?(product.serving_size?`per ${product.serving_size}`:'per serving'):'per 100 g'} from Open Food Facts.`,eaten_at,source:'manual' as const};
}
