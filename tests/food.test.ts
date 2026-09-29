import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFood } from '../supabase/functions/_shared/food.ts';
import { barcodeFood, dayKey, totals } from '../src/data.ts';
const example={name:'  Eggs and beans  ',calories:372,protein:30,carbs:28,fat:12,eaten_at:'2026-09-29T08:00:00+02:00',source:'chat'};
test('API validates, normalizes and prevents caller-supplied ownership',()=>{
  const result=validateFood(example);
  assert.equal(result.name,'Eggs and beans');assert.equal(result.eaten_at,'2026-09-29T06:00:00.000Z');assert.equal(result.notes,null);
  assert.equal(validateFood({...example,source:undefined}).source,'manual');
  for(const patch of [{user_id:'someone-else'},{id:'override'},{calories:-1},{calories:1.5},{calories:'372'},{protein:Infinity},{fat:NaN},{carbs:100001},{name:' '},{notes:5},{notes:'a'.repeat(2001)},{source:'admin'},{eaten_at:'2026-09-29T08:00:00'},{eaten_at:'invalid'}])assert.throws(()=>validateFood({...example,...patch}));
  assert.throws(()=>validateFood(null));
  assert.throws(()=>validateFood({...example,eaten_at:'2026-02-30T08:00:00Z'}));
  assert.throws(()=>validateFood({...example,eaten_at:'2026-09-29T24:00:00Z'}));
  assert.deepEqual(totals([result,result]),{calories:744,protein:60,carbs:56,fat:24});
  assert.deepEqual(totals([]),{calories:0,protein:0,carbs:0,fat:0});
  assert.equal(dayKey(new Date(2026,8,29,23,59)),'2026-09-29');
  assert.deepEqual(barcodeFood({status:1,product:{product_name:'Skyr',serving_size:'150 g',nutriments:{'energy-kcal_serving':92,proteins_serving:16,carbohydrates_serving:6,fat_serving:.3}}},'123','2026-09-29T12:00:00Z'),{name:'Skyr',calories:92,protein:16,carbs:6,fat:.3,notes:'Barcode 123; nutrition per 150 g from Open Food Facts.',eaten_at:'2026-09-29T12:00:00Z',source:'manual'});
  assert.throws(()=>barcodeFood({status:0},'404','2026-09-29T12:00:00Z'));
});
