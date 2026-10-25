import {useState} from 'react';
import {Action,Empty,ErrorBox,Field,Modal,Row,Spinner,api,fa,instantLabel,typeLabels,useResource,useSession} from './lib';
import {metricLabels} from './analytics-fields';

const groups=[
  {title:'بازدید و مخاطبان',keys:['views','firstHourViews','nextDayViews','viewers','reach','followersAtEnd','follows','unfollows','followersGained','profileVisits']},
  {title:'تعامل با محتوا',keys:['likes','comments','shares','reposts','saves','interactions']},
  {title:'نتیجه کسب‌وکار',keys:['leads','directMessages','orders','attributedSales','salesAttributionNotes']},
  {title:'تماشای ویدیو',keys:['videoDurationSeconds','averageWatchTimeSeconds','skipRatePercentage','reelsTabPercentage','explorePercentage','nonFollowersPercentage']},
  {title:'رفتار در استوری',keys:['storyReplies','storyLinkTaps','storyForward','storyBack','storyExits']},
];
export function MetricFields({fields,metrics,setMetrics,unavailable,setUnavailable,requiredKeys=[]}:{fields:Row[];metrics:Row;setMetrics:(r:Row)=>void;unavailable?:string[];setUnavailable?:(a:string[])=>void;requiredKeys?:string[]}){
  return <div className="metric-sections">{groups.map(group=>{
    const visible=fields.filter(field=>group.keys.includes(field.key));if(!visible.length)return null;
    return <section className="metric-section" key={group.title}><h3>{group.title}</h3><div className="metric-grid">{visible.map(field=>{
      const missing=unavailable?.includes(field.key),required=requiredKeys.includes(field.key);
      return <div key={field.key} className={`metric-field ${required?'metric-field-required':''}`}>
        <Field label={metricLabels[field.key]||field.label||field.key}>{field.kind==='text'||field.key.includes('Notes')?
          <textarea rows={3} value={metrics[field.key]??''} onChange={e=>setMetrics({...metrics,[field.key]:e.target.value})}/>:
          <input type="number" min={0} max={field.kind==='percent'?100:undefined} step="any" inputMode="decimal" aria-required={required&&!missing} disabled={missing} value={metrics[field.key]??''} placeholder="ثبت نشده" onChange={e=>{const next={...metrics};if(e.target.value==='')delete next[field.key];else next[field.key]=Number(e.target.value);setMetrics(next);}}/>}
        </Field>
        {required&&<small className="metric-required">برای نهایی کردن ضروری است</small>}
        {setUnavailable&&field.kind!=='text'&&<label className="check small"><input type="checkbox" checked={missing||false} onChange={e=>{setUnavailable(e.target.checked?[...(unavailable||[]),field.key]:(unavailable||[]).filter(k=>k!==field.key));if(e.target.checked){const next={...metrics};delete next[field.key];setMetrics(next);}}}/>در دسترس نیست / نامرتبط</label>}
      </div>;
    })}</div></section>;
  })}</div>;
}

function tehranInput(value=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value).replace(' ','T');}
const observation=(value:string)=>new Date(`${value}+03:30`);
const checkpoints:Row={first_hour:'ساعت اول',next_day:'روز بعد',later:'مشاهده بعدی'};
export function Analytics({item,onClose}:{item:Row;onClose:()=>void}){
  const fields=useResource<Row[]>(`/analytics/fields?type=${item.type}`),history=useResource<Row[]>(`/content/${item.id}/analytics`);
  const [checkpoint,setCheckpoint]=useState('next_day'),[observed,setObserved]=useState(tehranInput()),[observedTouched,setObservedTouched]=useState(false),[metrics,setMetrics]=useState<Row>({}),[unavailable,setUnavailable]=useState<string[]>([]),[editing,setEditing]=useState<Row|null>(null);
  const requiredKeys=[checkpoint==='first_hour'?'firstHourViews':checkpoint==='next_day'?'nextDayViews':'views','reach',...(['reel','video_story','video_carousel','mixed_carousel'].includes(item.type)?['averageWatchTimeSeconds']:[]),...(item.type.endsWith('_story')?['storyExits']:[])];
  const missing=requiredKeys.filter(key=>metrics[key]===undefined&&!unavailable.includes(key)&&!(key===requiredKeys[0]&&metrics.views!==undefined));
  function reset(){setEditing(null);setMetrics({});setUnavailable([]);setObserved(tehranInput());setObservedTouched(false);}
  const {toast}=useSession();
  async function save(finalized:boolean){
    if(finalized&&missing.length)throw new Error(`این شاخص‌ها را وارد کنید یا ناموجود بودنشان را مشخص کنید: ${missing.map(key=>metricLabels[key]).join('، ')}`);
    const at=observedTouched?observation(observed):new Date();
    if(!Number.isFinite(at.getTime())||at.getTime()>Date.now()+60000||at<new Date(item.published_at))throw new Error('زمان مشاهده باید پس از انتشار و پیش از اکنون باشد. زمان را به وقت تهران وارد کنید.');
    await api(editing?`/analytics/${editing.id}`:`/content/${item.id}/analytics`,{...(editing?{expectedVersion:editing.version}:{checkpoint}),observedAt:at.toISOString(),metrics,unavailable,finalized},editing?'PATCH':'POST');
    toast(finalized?'آمار نهایی شد؛ کار مربوطه تکمیل شد':'پیش‌نویس آمار ذخیره شد');reset();await history.refresh();
  }
  const elapsed=(observation(observed).getTime()-new Date(item.published_at).getTime())/3600000;
  return <Modal title={`آمار محتوا • ${item.data?.title||'بدون عنوان'}`} onClose={onClose} wide>
    <div className="analytics-context"><div><span className="eyebrow">{typeLabels[item.type]}</span><strong>{item.data?.title||'بدون عنوان'}</strong><p>انتشار: {instantLabel(item.published_at)}</p></div>{item.publication_url&&<a className="button" href={item.publication_url} target="_blank" rel="noreferrer">مشاهده پست منتشرشده</a>}</div>
    <details className="analytics-metadata"><summary>مشخصات محتوا، موضوع و سناریو</summary><dl>{[['title','کد / عنوان'],['topic','موضوع'],['scenario','سناریو / ایده'],['hook','هوک'],['description','توضیح'],['cta','دعوت به اقدام']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{item.data?.[key]||'ثبت نشده'}</dd></div>)}</dl></details>
    <p className="notice">خالی یعنی «ثبت نشده»؛ صفر یک مقدار واقعی است. داده ناموجود را علامت بزنید. مشاهده روز بعد با زمان واقعی ثبت می‌شود و لزوماً دقیقاً ۲۴ ساعت بعد نیست.</p>
    {editing&&<p className="notice">{editing.finalized?'در حال تصحیح مشاهده نهایی':'در حال تکمیل پیش‌نویس'} • نسخه {fa(editing.version)}. نوع مشاهده در زمان تصحیح ثابت است.</p>}
    <div className="form-grid"><Field label="نقطه مشاهده"><select disabled={!!editing} value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}>{Object.entries(checkpoints).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Field label="زمان واقعی مشاهده (تهران)" hint="زمان اندازه‌گیری آمار را وارد کنید؛ زمان یادآوری جداست."><input type="datetime-local" step="1" value={observed} onChange={e=>{setObserved(e.target.value);setObservedTouched(true);}}/></Field></div>
    {Number.isFinite(elapsed)&&<p className="muted">فاصله از انتشار: {fa(Math.max(0,elapsed).toFixed(1))} ساعت{checkpoint==='first_hour'&&elapsed>1.5?' • ثبت دیرهنگام ساعت اول':''}</p>}
    {fields.loading?<Spinner/>:fields.error?<ErrorBox error={fields.error} retry={fields.refresh}/>:<MetricFields fields={fields.data||[]} metrics={metrics} setMetrics={setMetrics} unavailable={unavailable} setUnavailable={setUnavailable} requiredKeys={requiredKeys}/>}
    <div className="form-save-bar"><div className="form-completeness">{missing.length?`${fa(missing.length)} شاخص ضروری باقی مانده`:'شاخص‌های ضروری تکمیل شده‌اند'}</div><div className="actions">{!editing?.finalized&&<Action disabled={fields.loading||!!fields.error} run={()=>save(false)}>ذخیره پیش‌نویس</Action>}<Action className="primary" disabled={fields.loading||!!fields.error} run={()=>save(true)}>{editing?.finalized?'ثبت تصحیح مشاهده':'نهایی کردن مشاهده'}</Action>{editing&&<button onClick={reset}>مشاهده تازه / لغو تصحیح</button>}</div></div>
    <details className="analytics-history" open><summary>مشاهدات و سابقه ({fa(history.data?.length||0)})</summary>{history.error&&<ErrorBox error={history.error} retry={history.refresh}/>} {!history.loading&&!history.data?.length&&!history.error&&<Empty title="هنوز آماری ثبت نشده">مشاهده تازه را از فرم بالا ذخیره کنید.</Empty>}{history.data?.map(row=><div className="history-row" key={row.id}><strong>{row.finalized?'نهایی':'پیش‌نویس'} • {checkpoints[row.checkpoint]}</strong><p>{instantLabel(row.observed_at)} • نسخه {fa(row.version)}{row.elapsed_hours!=null&&` • ${fa(Number(row.elapsed_hours).toFixed(1))} ساعت پس از انتشار`}{row.late_entry?' • ثبت دیرهنگام':''}</p><div className="compact-metrics">{Object.entries(row.metrics||{}).map(([key,value])=><span key={key}>{metricLabels[key]||key}: {typeof value==='number'?fa(value):String(value)}</span>)}</div>{row.unavailable?.length>0&&<p>ناموجود: {row.unavailable.map((key:string)=>metricLabels[key]).join('، ')}</p>}<button onClick={e=>{setEditing(row);setCheckpoint(row.checkpoint);setObserved(tehranInput(new Date(row.observed_at)));setObservedTouched(true);setMetrics({...row.metrics});setUnavailable([...row.unavailable||[]]);e.currentTarget.closest('.modal-body')?.scrollTo({top:0});}}>{row.finalized?'تصحیح این مشاهده':'ادامه پیش‌نویس'}</button></div>)}</details>
  </Modal>;
}

