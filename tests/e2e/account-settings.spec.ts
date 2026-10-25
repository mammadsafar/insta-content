import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
const memberId='22222222-2222-4222-8222-222222222222',avatarId='33333333-3333-4333-8333-333333333333';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxWkAAAAASUVORK5CYII=','base64');
async function setup(page:Page,owner:boolean,dark:boolean){
 const user={id:'11111111-1111-4111-8111-111111111111',name:'کاربر آزمون',email:'test@test.invalid',role:owner?'owner':'member',active:true,theme:dark?'dark':'light',permissions:[],avatar_id:null as string|null};
 const writes:{path:string;body:any}[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  if(path.startsWith('/api/media/')){await route.fulfill({contentType:'image/png',body:image});return;}
  if(path.startsWith('/api/')){
   let data:any=[];
   if(path==='/api/auth/me'){if(method==='PATCH'){const body=route.request().postDataJSON();writes.push({path,body});Object.assign(user,{avatar_id:body.avatarId});}data=user;}
   else if(path==='/api/users')data=[{...user},{id:memberId,name:'عضو نمونه',email:'member@test.invalid',role:'member',active:true,permissions:[]}];
   else if(path===`/api/users/${memberId}`){writes.push({path,body:route.request().postDataJSON()});data={id:memberId};}
   else if(path==='/api/media'){expect(new URL(route.request().url()).searchParams.get('purpose')).toBe('profile_avatar');expect(new URL(route.request().url()).searchParams.has('pageId')).toBe(false);data={id:avatarId};}
   else if(path==='/api/today')data={pages:[],tasks:[],work:[],pageTrends:[],stats:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify({data})});return;
  }
  try{const file=resolve('dist/web',path==='/'?'index.html':path.slice(1));await route.fulfill({body:await readFile(file),contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'} as Record<string,string>)[extname(file)]||'text/html'});}catch{await route.fulfill({status:404,body:'missing'});}
 });
 await page.goto('http://accounts-fixture.test/');
 await expect(page.getByRole('heading',{name:'سلام، کاربر.'})).toBeVisible();
 if(await page.getByRole('button',{name:'تنظیمات حساب',exact:true}).isVisible())await page.getByRole('button',{name:'تنظیمات حساب',exact:true}).click();else await page.locator('.account-button').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('dialog').evaluate(async element=>{await Promise.all([element,element.parentElement!].flatMap(node=>node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));});
 return {writes,errors};
}
test('admin resets a member password with confirmation in a dedicated dialog',async({page},info)=>{
 const {writes,errors}=await setup(page,true,info.project.name.includes('dark'));
 await page.getByRole('button',{name:'مدیریت تیم و صفحه‌ها'}).click();
 await page.getByRole('button',{name:'بازنشانی رمز',exact:true}).click();
 await page.getByLabel('رمز جدید (حداقل ۱۲ نویسه)',{exact:true}).fill('New-test-password-2026!');
 await page.getByLabel('تکرار رمز جدید',{exact:true}).fill('different');
 await expect(page.getByRole('button',{name:'ذخیره رمز جدید',exact:true})).toBeDisabled();
 await page.getByLabel('تکرار رمز جدید',{exact:true}).fill('New-test-password-2026!');
 await page.getByRole('button',{name:'ذخیره رمز جدید',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(1);
 expect(writes).toEqual([{path:`/api/users/${memberId}`,body:{password:'New-test-password-2026!'}}]);expect(errors).toEqual([]);
});
test('member uploads, saves and removes a personal photo without page permissions',async({page},info)=>{
 const {writes,errors}=await setup(page,false,info.project.name.includes('dark'));
 await expect(page.getByRole('button',{name:'مدیریت تیم و صفحه‌ها'})).toHaveCount(0);
 await page.locator('.profile-photo input[type=file]').setInputFiles({name:'profile.png',mimeType:'image/png',buffer:image});
 await expect(page.getByAltText('عکس پروفایل شما')).toBeVisible();
 await page.getByRole('button',{name:'ذخیره عکس پروفایل',exact:true}).click();
 await expect(page.locator('.account-button img')).toHaveAttribute('src',`/api/media/${avatarId}?thumbnail=1`);
 await page.getByRole('button',{name:'حذف عکس',exact:true}).click();
 await page.getByRole('button',{name:'ذخیره عکس پروفایل',exact:true}).click();
 await expect(page.locator('.account-button img')).toHaveCount(0);
 expect(writes).toEqual([{path:'/api/auth/me',body:{avatarId}},{path:'/api/auth/me',body:{avatarId:null}}]);expect(errors).toEqual([]);
});
