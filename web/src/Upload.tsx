import {useEffect,useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import {fa,useResource,type Row} from './lib';
import {CHUNK_BYTES,uploadRequest} from './upload-client';
let nextJobId=0;
type Job={id:string;file:File;status:'queued'|'sending'|'checking'|'done'|'paused'|'error';progress:number;error:string;uploadId?:string};
export function Upload({pageId,purpose='content',accept='image/*,video/*',onUploaded,multiple=true}:{pageId?:string;purpose?:string;accept?:string;onUploaded:(asset:Row)=>void;multiple?:boolean}){
 const config=useResource<Row>('/media/config'),[jobs,setJobs]=useState<Job[]>([]),busy=useRef(false),active=useRef<{id:string;controller:AbortController}|null>(null),alive=useRef(true),callback=useRef(onUploaded);callback.current=onUploaded;
 const maxBytes=purpose==='profile_avatar'?Math.min(Number(config.data?.maxBytes),5*1024*1024):Number(config.data?.maxBytes),ready=Number.isSafeInteger(maxBytes)&&maxBytes>0;
 const update=(id:string,changes:Partial<Job>)=>{if(alive.current)setJobs(previous=>previous.map(job=>job.id===id?{...job,...changes}:job));};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.controller.abort();};},[]);
 useEffect(()=>{
  if(busy.current)return;const job=jobs.find(value=>value.status==='queued');if(!job)return;
  busy.current=true;const controller=new AbortController(),signal=controller.signal;active.current={id:job.id,controller};update(job.id,{status:'sending',error:''});
  const request=<T=any,>(path:string,options:{method?:string;body?:XMLHttpRequestBodyInit;onProgress?:(n:number)=>void}={})=>uploadRequest<T>(path,{...options,signal});
  void (async()=>{
   let asset:Row;
   if(job.file.size>CHUNK_BYTES){
    let session:Row;
    if(job.uploadId)session=await request(`/media/uploads/${job.uploadId}`);
    else{session=await request('/media/uploads',{method:'POST',body:JSON.stringify({...(pageId?{pageId}:{}),purpose,name:job.file.name,mimeType:job.file.type||'application/octet-stream',size:job.file.size})});update(job.id,{uploadId:session.id});}
    let offset=Number(session.received);
    if(!Number.isSafeInteger(offset)||offset<0||offset>job.file.size)throw new Error('موقعیت ادامه آپلود معتبر نیست؛ فایل را دوباره انتخاب کنید.');
    while(offset<job.file.size){
     const start=offset,end=Math.min(start+CHUNK_BYTES,job.file.size);
     const next=await request(`/media/uploads/${session.id}?offset=${start}`,{method:'PUT',body:job.file.slice(start,end),onProgress:sent=>update(job.id,{progress:Math.min(99,Math.floor((start+Math.min(sent,end-start))/job.file.size*100))})});
     offset=Number(next.received);if(offset!==end)throw new Error('تأیید دریافت بخش فایل نامعتبر است؛ دوباره تلاش کنید.');
    }
    update(job.id,{status:'checking',progress:99});asset=await request(`/media/uploads/${session.id}/complete`,{method:'POST',body:'{}'});
   }else{
    const body=new FormData();body.append('file',job.file);
    asset=await request(`/media?${new URLSearchParams({purpose,...(pageId?{pageId}:{})})}`,{method:'POST',body,onProgress:sent=>update(job.id,{progress:Math.min(99,Math.floor(sent/job.file.size*100))})});
   }
   update(job.id,{status:'done',progress:100});callback.current(asset);
  })().catch(error=>update(job.id,{status:signal.aborted?'paused':'error',error:signal.aborted?'':error.message})).finally(()=>{busy.current=false;active.current=null;if(alive.current)setJobs(previous=>[...previous]);});
 },[jobs]);
 function add(files:File[]){setJobs(previous=>[...previous,...files.map(file=>({id:`upload-${++nextJobId}`,file,status:(!file.size||file.size>maxBytes?'error':'queued') as Job['status'],progress:0,error:!file.size?'فایل خالی است':file.size>maxBytes?`حداکثر حجم مجاز هر فایل ${fa(Math.floor(maxBytes/1048576))} مگابایت است`:'',}))]);}
 return <div className="upload"><label className="upload-target"><Plus size={22}/><strong>انتخاب فایل</strong><span>{ready?`حداکثر هر فایل ${fa(Math.floor(maxBytes/1048576))} مگابایت • فایل‌ها به ترتیب ارسال می‌شوند`:'در حال دریافت محدودیت فعال سرور…'}</span><input type="file" disabled={!ready||config.loading} accept={accept} multiple={multiple} onChange={event=>{add(Array.from(event.target.files||[]));event.target.value='';}}/></label>
 {(config.error||!config.loading&&!ready)&&<p role="alert" className="error">{config.error||'نسخه سرور اطلاعات آپلود را برنمی‌گرداند؛ نسخه جدید را روی سرور اعمال کنید.'}<button onClick={()=>void config.refresh()}>بررسی دوباره</button></p>}
 {jobs.map(job=><div className="upload-job" key={job.id}><span dir="auto">{job.file.name}</span><progress aria-label={`پیشرفت ${job.file.name}`} max="100" value={job.progress}/><small role="status">{job.status==='done'?'آماده':job.status==='queued'?'در صف':job.status==='checking'?'فایل ارسال شد؛ در حال بررسی سرور':job.status==='paused'?'متوقف شد':job.status==='error'?'ارسال ناموفق':`${fa(job.progress)}٪ • در حال ارسال`}</small>{job.error&&<small role="alert" className="danger-text">{job.error}</small>}{['sending','checking','queued'].includes(job.status)&&<button onClick={()=>{if(active.current?.id===job.id)active.current.controller.abort();else update(job.id,{status:'paused'});}}>توقف</button>}{['error','paused'].includes(job.status)&&job.file.size>0&&job.file.size<=maxBytes&&<button onClick={()=>update(job.id,{status:'queued',error:''})}>{job.uploadId?'ادامه آپلود':'تلاش دوباره'}</button>}</div>)}
 </div>;
}
