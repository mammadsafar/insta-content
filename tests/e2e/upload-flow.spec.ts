import {test,expect} from '@playwright/test';
import {readFile,mkdtemp,writeFile,truncate,rm} from 'node:fs/promises';
import {extname,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const pageId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222',assetId='33333333-3333-4333-8333-333333333333';
test('large uploads resume confirmed chunks and avoid video preload',async({page},info)=>{
 const root=await mkdtemp(join(tmpdir(),'rooz-upload-browser-')),file=join(root,'large-video.mp4');
 await writeFile(file,Buffer.from('video-fixture'));await truncate(file,101*1024*1024);
 let received=0,failed=false,completed=false,smallStartedEarly=false;const offsets:number[]=[],sizes:number[]=[],errors:string[]=[],mediaReads:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();let data:any=[];
  if(path.startsWith('/api/')){
   if(path==='/api/auth/me')data={id:pageId,name:'آزمون آپلود',email:'test@test.invalid',role:'owner',theme:info.project.name.includes('dark')?'dark':'light',permissions:[]};
   else if(path==='/api/pages')data=[{id:pageId,name:'صفحه آزمون',username:'test_page'}];
   else if(path==='/api/media/config')data={maxBytes:314572800,chunkBytes:8388608,chunked:true};
   else if(path==='/api/media/uploads')data={id:sessionId,received:0};
   else if(path===`/api/media/uploads/${sessionId}`){
    if(method==='PUT'){
     const offset=Number(url.searchParams.get('offset')),size=request.postDataBuffer()!.length;offsets.push(offset);sizes.push(size);expect(offset).toBe(received);expect(size).toBeLessThanOrEqual(8*1024*1024);received+=size;
     if(!failed){failed=true;await route.fulfill({status:502,contentType:'text/html',body:'<h1>proxy connection dropped after accepting chunk</h1>'});return;}
    }
    data={id:sessionId,received};
   }else if(path===`/api/media/uploads/${sessionId}/complete`){expect(received).toBe(101*1024*1024);completed=true;data={id:assetId,mime_type:'video/mp4',original_name:'large-video.mp4'};}
   else if(path==='/api/media'){if(!completed)smallStartedEarly=true;data={id:'44444444-4444-4444-8444-444444444444',mime_type:'image/png',original_name:'small.png'};}
   else if(path.startsWith('/api/media/')){mediaReads.push(path);await route.fulfill({status:404,body:'must not preload video'});return;}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({data})});return;
  }
  try{const file=resolve('dist/web',path==='/'?'index.html':path.slice(1));await route.fulfill({body:await readFile(file),contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'} as Record<string,string>)[extname(file)]||'text/html'});}catch{await route.fulfill({status:404,body:'missing'});}
 });
 try{
  await page.goto('http://upload-fixture.test/#pages');await page.getByRole('button',{name:'محتوای تازه',exact:true}).click();
  const input=page.locator('.editor-grid section').first().locator('.upload input[type=file]').first();await expect(input).toBeEnabled();await input.setInputFiles(file);
  await expect(page.getByRole('button',{name:'ادامه آپلود',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ادامه آپلود',exact:true}).click();
  await input.setInputFiles({name:'small.png',mimeType:'image/png',buffer:Buffer.from('small-image-fixture')});
  await expect(page.locator('.upload-job').first()).toContainText('آماده',{timeout:30000});
  await expect(page.locator('.upload-job').nth(1)).toContainText('آماده');
  expect(offsets[0]).toBe(0);expect(offsets[1]).toBe(2*1024*1024);expect(sizes.reduce((a,b)=>a+b,0)).toBe(101*1024*1024);
  expect(mediaReads).not.toContain(`/api/media/${assetId}`);expect(smallStartedEarly).toBe(false);expect(errors).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
});
