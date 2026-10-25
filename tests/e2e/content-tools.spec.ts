import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';

const pageId='11111111-1111-4111-8111-111111111111',contentId='22222222-2222-4222-8222-222222222222';
const assetIds=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const originalBytes=[Buffer.from('original-video-fixture-without-reencoding'),Buffer.from('original-cover-fixture'),Buffer.from('original-music-fixture')];
const title='پست منتشرشده برای بررسی فرم‌ها';
const item={id:contentId,page_id:pageId,type:'reel',state:'published',revision:1,approved_revision:1,published_at:'2026-01-01T08:00:00Z',publication_url:'https://www.instagram.com/p/example/',first_hour_completed:false,next_day_completed:false,lead_asset_has_thumbnail:true,
  data:{title,caption:'کپشن اصلی',topic:'آموزش',scenario:'سناریوی نمونه',hook:'هوک نمونه',description:'شرح محتوا',cta:'ذخیره کنید',assets:[assetIds[0]],coverId:assetIds[1],music:{mode:'instagram',trackName:'قطعه پیوست‌شده',audioId:assetIds[2]}},
  assets:assetIds.map((id,index)=>({id,original_name:['post-original.mp4','cover-original.png','music-original.mp3'][index],mime_type:['video/mp4','image/png','audio/mpeg'][index],size:originalBytes[index].length})),feedback:[],revisions:[]};
const fieldKeys=['views','firstHourViews','nextDayViews','viewers','reach','likes','comments','shares','reposts','saves','followersGained','profileVisits','leads','directMessages','orders','attributedSales','salesAttributionNotes','videoDurationSeconds','averageWatchTimeSeconds','skipRatePercentage','reelsTabPercentage','explorePercentage','nonFollowersPercentage'];

async function fixture(page:Page,dark:boolean){
  const writes:{path:string;method:string;body:any}[]=[],snapshots:any[]=[],weekly:any[]=[];
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let data:any=[];
    if(path.startsWith('/api/media/')){
      const index=assetIds.findIndex(id=>path.includes(id));
      if(path.endsWith('/download')){await route.fulfill({status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${item.assets[index].original_name}"`},body:originalBytes[index]});return;}
      await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxWkAAAAASUVORK5CYII=','base64')});return;
    }
    if(path.startsWith('/api/')){
      if(method!=='GET')writes.push({path,method,body:route.request().postDataJSON()});
      if(path==='/api/auth/me')data={id:pageId,name:'کاربر آزمون',email:'fixture@test.invalid',role:'owner',active:true,theme:dark?'dark':'light',permissions:[]};
      else if(path==='/api/pages')data=[{id:pageId,name:'صفحه آزمون',username:'test_page',settings:{}}];
      else if(path===`/api/pages/${pageId}/content`)data=[item];
      else if(path===`/api/content/${contentId}`)data=item;
      else if(path==='/api/analytics/fields')data=fieldKeys.map(key=>({key,kind:key.endsWith('Notes')?'text':key.endsWith('Percentage')?'percent':'number'}));
      else if(path===`/api/content/${contentId}/analytics`){
        if(method==='POST'){const body=route.request().postDataJSON();data={...body,id:'66666666-6666-4666-8666-666666666666',observed_at:body.observedAt,version:1};snapshots.push(data);}else data=snapshots;
      }else if(path.startsWith('/api/analytics/')){
        const old=snapshots[0],body=route.request().postDataJSON();data={...old,...body,observed_at:body.observedAt,version:old.version+1};snapshots[0]=data;
      }else if(path===`/api/pages/${pageId}/weekly-reports`){
        if(method==='POST'){const body=route.request().postDataJSON();const end=new Date(`${body.periodStart}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+7);data={...body,id:'77777777-7777-4777-8777-777777777777',version:1,period_start:body.periodStart,period_end:end.toISOString().slice(0,10)};weekly.push(data);}else data=weekly;
      }else if(path.startsWith('/api/weekly-reports/')){data={...weekly[0],...route.request().postDataJSON(),version:weekly[0].version+1};weekly[0]=data;}
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});return;
    }
    const file=resolve('dist/web',path==='/'?'index.html':path.slice(1));
    try{await route.fulfill({body:await readFile(file),contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'} as Record<string,string>)[extname(file)]||'text/html'});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto('http://forms-fixture.test/#pages');
  await page.getByRole('button',{name:'منتشرشده',exact:true}).click();
  await expect(page.getByRole('button',{name:`جزئیات ${title}`,exact:true})).toBeVisible();
  return {writes,errors};
}
async function fits(page:Page){
  await page.getByRole('dialog').last().evaluate(async element=>{await Promise.all([element,element.parentElement!].flatMap(node=>node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));});
  const size=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
  const dialog=page.getByRole('dialog').last(),box=await dialog.boundingBox(),viewport=page.viewportSize()!;expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(-1);expect(box!.y).toBeGreaterThanOrEqual(-1);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height+1);
  await expect(dialog.locator('.modal-heading').getByRole('button',{name:'بستن',exact:true})).toBeVisible();
}

test('published analytics supports all field groups, zero, drafts, correction and page reports',async({page},info)=>{
  const {writes,errors}=await fixture(page,info.project.name.includes('dark'));
  await page.getByRole('button',{name:'بدون آمار',exact:true}).click();await expect(page.getByRole('button',{name:`جزئیات ${title}`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ثبت آمار',exact:true}).click();await fits(page);
  await expect(page.getByLabel('زمان واقعی مشاهده (تهران)',{exact:true})).toBeVisible();
  await page.getByLabel('زمان واقعی مشاهده (تهران)',{exact:true}).fill('2026-01-02T11:30');
  await page.getByLabel('نقطه مشاهده',{exact:true}).selectOption('first_hour');
  await page.getByLabel('بازدید ساعت اول',{exact:true}).fill('0');
  await page.getByLabel('حساب‌های دسترسی‌یافته',{exact:true}).fill('12');
  await page.getByLabel('میانگین تماشا (ثانیه)',{exact:true}).fill('4.5');
  await page.getByRole('button',{name:'ذخیره پیش‌نویس',exact:true}).click();
  await page.getByRole('button',{name:'ادامه پیش‌نویس',exact:true}).click();
  await expect(page.getByLabel('نقطه مشاهده',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('بازدید ساعت اول',{exact:true})).toHaveValue('0');
  await page.getByRole('button',{name:'نهایی کردن مشاهده',exact:true}).click();
  await expect(page.getByRole('button',{name:'تصحیح این مشاهده',exact:true})).toBeVisible();
  const post=writes.find(write=>write.method==='POST')!;expect(post.body.metrics).toEqual({firstHourViews:0,reach:12,averageWatchTimeSeconds:4.5});expect(post.body.metrics.comments).toBeUndefined();
  expect(post.body.observedAt).toBe('2026-01-02T08:00:00.000Z');
  expect(writes.find(write=>write.method==='PATCH')!.body.finalized).toBe(true);
  await page.getByRole('button',{name:'تصحیح این مشاهده',exact:true}).click();
  await page.locator('.metric-field').filter({has:page.getByLabel('حساب‌های دسترسی‌یافته',{exact:true})}).getByRole('checkbox').check();
  await expect(page.getByLabel('حساب‌های دسترسی‌یافته',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'ثبت تصحیح مشاهده',exact:true}).click();
  expect(writes.filter(write=>write.path.startsWith('/api/analytics/')).at(-1)!.body.unavailable).toEqual(['reach']);
  await page.getByRole('dialog').last().locator('.modal-heading').getByRole('button',{name:'بستن',exact:true}).click();
  await page.getByRole('button',{name:'ثبت آنالیز پیج',exact:true}).click();await fits(page);
  await page.getByLabel('دنبال‌کنندگان پایان دوره',{exact:true}).fill('1200');
  await page.getByLabel('پیام مستقیم',{exact:true}).fill('2');await page.getByLabel('سرنخ',{exact:true}).fill('1');await page.getByLabel('سفارش',{exact:true}).fill('0');
  await page.getByRole('button',{name:'ثبت نهایی گزارش',exact:true}).click();
  await page.getByRole('button',{name:'ثبت تصحیح گزارش',exact:true}).click();
  expect(writes.filter(write=>write.path.endsWith('/weekly-reports')&&write.method==='POST')).toHaveLength(1);
  expect(writes.find(write=>write.path.startsWith('/api/weekly-reports/')&&write.method==='PATCH')!.body.metrics).toEqual({followersAtEnd:1200,directMessages:2,leads:1,orders:0});
  expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('page-analytics.png')});
});

test('post, cover and attached music download the original bytes from visible actions',async({page},info)=>{
  const {errors}=await fixture(page,info.project.name.includes('dark'));
  await page.getByRole('button',{name:'دانلود محتوا',exact:true}).click();await fits(page);
  const dialog=page.getByRole('dialog').last();await expect(dialog.getByRole('link',{name:'دریافت بسته اصلی',exact:true})).toHaveAttribute('href',`/api/content/${contentId}/download.zip`);
  for(let index=0;index<assetIds.length;index++){
    const pending=page.waitForEvent('download');await dialog.locator(`a[href="/api/media/${assetIds[index]}/download"]`).click();const download=await pending;
    expect(download.suggestedFilename()).toBe(item.assets[index].original_name);expect(await readFile((await download.path())!)).toEqual(originalBytes[index]);
  }
  expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('original-downloads.png')});
});

test('nested dialogs stay inside the viewport, keep parent scroll locked and restore page position',async({page},info)=>{
  await fixture(page,info.project.name.includes('dark'));
  const open=page.getByRole('button',{name:`جزئیات ${title}`,exact:true});await open.scrollIntoViewIfNeeded();const original=await page.evaluate(()=>scrollY);await open.click();await fits(page);
  const parent=page.getByRole('dialog').last();await parent.getByRole('button',{name:'ثبت آمار',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(2);await fits(page);
  await page.getByRole('dialog').last().locator('.modal-heading').getByRole('button',{name:'بستن',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);expect(await page.evaluate(()=>document.body.style.position)).toBe('fixed');
  await parent.getByRole('link',{name:'دریافت بسته اصلی',exact:true}).scrollIntoViewIfNeeded();await expect(parent.getByRole('link',{name:'دریافت بسته اصلی',exact:true})).toBeVisible();
  await page.setViewportSize({width:page.viewportSize()!.width,height:430});await fits(page);
  await parent.locator('.modal-heading').getByRole('button',{name:'بستن',exact:true}).click();
  expect(await page.evaluate(()=>document.body.style.position)).toBe('');expect(Math.abs(await page.evaluate(()=>scrollY)-original)).toBeLessThanOrEqual(1);
});

test('content details and music fields remain reachable while the date picker opens above the editor',async({page},info)=>{
  await fixture(page,info.project.name.includes('dark'));
  await page.getByRole('button',{name:'محتوای تازه',exact:true}).click();await fits(page);
  await page.getByLabel('کد یا عنوان کوتاه',{exact:true}).fill('پیش‌نویس بررسی اسکرول');
  await page.getByLabel('سناریو / ایده',{exact:true}).fill('شرح سناریو');
  await page.getByLabel('دعوت به اقدام',{exact:true}).fill('ارسال پیام');
  await page.getByLabel('نام قطعه',{exact:true}).fill('موسیقی نمونه');
  await page.getByRole('dialog').getByRole('button',{name:'انتخاب تاریخ',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);await fits(page);
  await page.getByRole('button',{name:'فردا',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:'انتخاب تاریخ',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await page.evaluate(()=>document.body.style.position)).toBe('fixed');
  await page.getByRole('button',{name:'ذخیره پیش‌نویس',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'ذخیره پیش‌نویس',exact:true})).toBeVisible();
  await page.getByRole('dialog').locator('.modal-heading').getByRole('button',{name:'بستن',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>document.body.style.position)).toBe('');
});
