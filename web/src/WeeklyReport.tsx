import {useState} from 'react';
import {Action,Empty,ErrorBox,Field,Modal,Row,Upload,api,addDays,dateLabel,fa,instantLabel,localDate,useResource,useSession} from './lib';
import {DatePicker} from './DatePicker';
import {MetricFields} from './AnalyticsForm';

const weeklyKeys=['followersAtEnd','follows','unfollows','views','reach','interactions','profileVisits','directMessages','leads','orders','attributedSales','salesAttributionNotes'];
export function WeeklyReport({page,period,onClose,onDone}:{page:Row;period?:string;onClose:()=>void;onDone?:()=>void}){
  const today=localDate(),weekday=new Date(`${today}T12:00:00Z`).getUTCDay();
  const [start,setStart]=useState(period||addDays(today,-((weekday+1)%7)-7)),[metrics,setMetrics]=useState<Row>({}),[notes,setNotes]=useState(''),[screenshots,setScreenshots]=useState<string[]>([]),[editing,setEditing]=useState<Row|null>(null);
  const history=useResource<Row[]>(`/pages/${page.id}/weekly-reports`),{toast}=useSession(),end=addDays(start,7);
  async function save(finalized:boolean){
    if(finalized&&metrics.followersAtEnd===undefined)throw new Error('تعداد دنبال‌کنندگان پایان دوره را وارد کنید.');
    if(new Date(`${start}T12:00:00Z`).getUTCDay()!==6||end>today)throw new Error('دوره باید از شنبه و مربوط به یک هفته کامل گذشته باشد.');
    const result=await api(editing?`/weekly-reports/${editing.id}`:`/pages/${page.id}/weekly-reports`,{...(editing?{expectedVersion:editing.version}:{periodStart:start}),metrics,notes,screenshots,finalized},editing?'PATCH':'POST');
    setEditing(result);toast(finalized?'گزارش هفتگی نهایی شد':'پیش‌نویس گزارش ذخیره شد');await history.refresh();onDone?.();
  }
  function reset(){setEditing(null);setMetrics({});setNotes('');setScreenshots([]);}
  return <Modal title={`آنالیز پیج / گزارش هفتگی • ${page.name}`} onClose={onClose} wide>
    <div className="analytics-context"><div><span className="eyebrow">آمار واقعی Insights صفحه</span><strong>{page.name}</strong><p>ثبت آمار برای همه اعضای فعال امکان‌پذیر است.</p></div></div>
    {editing?<div className="notice">در حال {editing.finalized?'تصحیح گزارش نهایی':'تکمیل پیش‌نویس'} دوره {dateLabel(start)} • نسخه {fa(editing.version)} <button onClick={reset}>دوره تازه / لغو</button></div>:<DatePicker label="شروع دوره (شنبه)" value={start} onChange={value=>{setStart(value);reset();}}/>}
    <p className="notice">از {dateLabel(start,true)} ساعت ۰۰:۰۰ تا {dateLabel(end,true)} ساعت ۰۰:۰۰ (انحصاری)، تهران. مقادیر صفحه را از Insights وارد کنید؛ خالی با صفر متفاوت است.</p>
    <MetricFields fields={weeklyKeys.map(key=>({key,kind:key.includes('Notes')?'text':'number'}))} metrics={metrics} setMetrics={setMetrics} requiredKeys={['followersAtEnd']}/>
    <Field label="یادداشت کلی"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
    <Field label="تصاویر Insights (اختیاری)"><Upload pageId={page.id} purpose="insights" accept="image/*" onUploaded={asset=>setScreenshots(previous=>[...previous,asset.id])}/></Field>
    {screenshots.length>0&&<div className="screenshot-list">{screenshots.map(id=><div key={id}><a href={`/api/media/${id}`} target="_blank" rel="noreferrer"><img src={`/api/media/${id}?thumbnail=1`} alt="تصویر Insights"/></a><button onClick={()=>setScreenshots(screenshots.filter(value=>value!==id))}>حذف</button></div>)}</div>}
    <div className="form-save-bar"><div className="actions">{!editing?.finalized&&<Action run={()=>save(false)}>ذخیره پیش‌نویس</Action>}<Action className="primary" run={()=>save(true)}>{editing?.finalized?'ثبت تصحیح گزارش':'ثبت نهایی گزارش'}</Action></div></div>
    <details open><summary>گزارش‌های ثبت‌شده و تصحیح</summary>{history.error&&<ErrorBox error={history.error} retry={history.refresh}/>} {history.data?.length===0&&<Empty title="گزارشی ثبت نشده"/>}{history.data?.map(row=><div className="history-row" key={row.id}><strong>{dateLabel(row.period_start)} تا {dateLabel(row.period_end)} • {row.finalized?'نهایی':'پیش‌نویس'}</strong><p>نسخه {fa(row.version)} • {instantLabel(row.submitted_at)}</p><button onClick={e=>{setEditing(row);setStart(row.period_start.slice(0,10));setMetrics({...row.metrics});setNotes(row.notes||'');setScreenshots(row.screenshots||[]);e.currentTarget.closest('.modal-body')?.scrollTo({top:0});}}>{row.restricted?'ثبت اصلاح این دوره با داده تازه':'باز کردن فرم / تصحیح گزارش'}</button>{row.restricted&&<p className="muted">اعداد گزارش قبلی به دلیل سطح دسترسی نمایش داده نمی‌شوند.</p>}</div>)}</details>
  </Modal>;
}
