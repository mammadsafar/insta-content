import {useState} from 'react';
import {Analytics} from './Analytics';
import {Empty,ErrorBox,Spinner,dateLabel,fa,typeLabels,useResource,type Row} from './lib';
export function PostAnalytics({page}:{page:Row}){
 const content=useResource<Row[]>(`/pages/${page.id}/content?kind=post`),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<Row|null>(null);
 const posts=(content.data||[]).filter(item=>item.state==='published'&&!item.trashed_at),complete=(item:Row)=>item.first_hour_completed&&item.next_day_completed;
 const visible=posts.filter(item=>(filter==='all'||(filter==='missing'?!complete(item):complete(item)))&&`${item.data.title||''} ${item.data.topic||''}`.includes(search));
 return <section className="post-analytics" aria-label="ورود دیتای آنالیز پست‌ها">
  <div className="panel analytics-entry-intro"><span className="eyebrow">ثبت دستی Instagram Insights</span><h2>دیتای آنالیز پست‌ها</h2><p>پست منتشرشده را انتخاب کنید؛ آمار ساعت اول، روز بعد یا مشاهده بعدی را وارد و ذخیره کنید. ورود داده برای همه اعضای فعال در دسترس است.</p><div className="analytics-entry-counts"><span>{fa(posts.length)} پست منتشرشده</span><span>{fa(posts.filter(item=>!complete(item)).length)} پست با آمار ناقص</span></div></div>
  <div className="toolbar analytics-entry-filters"><input type="search" aria-label="جستجوی پست برای آنالیز" placeholder="عنوان یا موضوع پست…" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="وضعیت آمار پست" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">همه پست‌های منتشرشده</option><option value="missing">نیازمند تکمیل آمار</option><option value="complete">آمار ساعت اول و روز بعد تکمیل است</option></select></div>
  {content.error&&<ErrorBox error={content.error} retry={content.refresh}/>}
  {content.loading?<Spinner/>:!visible.length?<Empty title={posts.length?'پستی مطابق این جستجو نیست':'هنوز پست منتشرشده‌ای ثبت نشده'}>{posts.length?'جستجو یا وضعیت آمار را تغییر دهید.':'پس از ثبت انتشار در بخش پست‌ها، فرم ورود آنالیز اینجا در دسترس قرار می‌گیرد.'}</Empty>:<div className="analytics-post-list">{visible.map(item=><article className="panel analytics-post-row" key={item.id}><div><span className="eyebrow">{typeLabels[item.type]}</span><h3>{item.data.title||'پست بدون عنوان'}</h3><p className="muted">انتشار: {dateLabel(item.published_at,true)}{item.data.topic&&` • ${item.data.topic}`}</p><div className="analytics-post-status"><span>ساعت اول: {item.first_hour_completed?'ثبت نهایی شده':'نیازمند ثبت'}</span><span>روز بعد: {item.next_day_completed?'ثبت نهایی شده':'نیازمند ثبت'}</span></div></div><button className="primary" onClick={()=>setSelected(item)}>ورود / ویرایش دیتای آنالیز</button></article>)}</div>}
  {selected&&<Analytics item={selected} onClose={()=>{setSelected(null);void content.refresh();}}/>}
 </section>;
}
