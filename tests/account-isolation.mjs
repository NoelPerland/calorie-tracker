import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {build,preview} from 'vite';
await build({logLevel:'warn',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://guest-auth-fixture.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('public-test-fixture')},build:{outDir:'.qa/auth-build'}});
const server=await preview({logLevel:'warn',build:{outDir:'.qa/auth-build'},preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext();
const page=await context.newPage();
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'},'test-signature'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
const rows=[];
await context.route('https://guest-auth-fixture.invalid/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const reply=json=>route.fulfill({json,headers:{'access-control-allow-origin':'*'}});
  if(url.pathname.endsWith('/token'))return reply({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
  if(url.pathname.endsWith('/user'))return reply(user);
  if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
  if(url.pathname.endsWith('/food_entries')){
    if(request.method()==='POST'){
      const input=request.postDataJSON();
      assert.equal(input.user_id,user.id);
      assert.notEqual(input.name,'Private guest meal');
      const row={...input,id:crypto.randomUUID(),created_at:new Date().toISOString()};rows.push(row);return reply({id:row.id});
    }
    assert.equal(url.searchParams.get('user_id'),`eq.${user.id}`);
    return reply(rows);
  }
  throw Error('Unexpected fixture request: '+url.pathname);
});
try{
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button',{name:'Continue on this device'}).click();
  async function add(name){
    await page.getByRole('button',{name:'Log food',exact:false}).click();
    await page.getByRole('button',{name:'Enter a meal'}).click();
    await page.getByRole('dialog').getByLabel('Food or meal name').fill(name);
    await page.getByRole('dialog').getByLabel('calories kcal').fill('300');
    await page.getByRole('button',{name:/Save (changes|meal)/}).click();
    await page.getByRole('heading',{name}).waitFor();
  }
  await add('Private guest meal');
  await page.getByRole('button',{name:'Leave device journal'}).click();
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign in →',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Private guest meal'}).count(),0);
  await add('Account meal');
  assert.equal(rows.length,1);
  assert.ok(await page.evaluate(()=>!JSON.stringify(localStorage).includes('Account meal')));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Continue on this device'}).click();
  await page.getByRole('heading',{name:'Private guest meal'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Account meal'}).count(),0);
  console.log('PASS mocked Supabase account sign-in, owner-filtered read/write, sign-out and guest/account isolation. No live credentials used.');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
