import {Download,FileAudio,Image,Layers} from 'lucide-react';
import {ErrorBox,Modal,Row,Spinner,fa,useResource} from './lib';

function fileSize(value:unknown){const size=Number(value);if(!Number.isFinite(size)||size<=0)return '';if(size<1024)return `${fa(size)} بایت`;return size<1048576?`${fa((size/1024).toFixed(1))} کیلوبایت`:`${fa((size/1048576).toFixed(2))} مگابایت`;}
export function DownloadPanel({item}:{item:Row}){
  const ids:string[]=item.data?.assets||[],music=item.data?.music;
  const files=[...ids.map((id,index)=>({id,label:`فایل ${fa(index+1)} پست`,Icon:Layers})),...(item.data?.coverId?[{id:item.data.coverId,label:'کاور اصلی',Icon:Image}]:[]),...(music?.audioId?[{id:music.audioId,label:'موسیقی اصلی',Icon:FileAudio}]:[])];
  return <section className="download-panel"><div className="toolbar"><div><h3><Download size={18}/>دانلود محتوا</h3><p className="muted">فایل اصلی بدون تغییر کیفیت، اندازه یا فرمت دریافت می‌شود.</p></div>{ids.length>0&&<a className="button primary" href={`/api/content/${item.id}/download.zip`}><Download size={17}/>دریافت بسته اصلی</a>}</div>
    <div className="download-files">{files.map((file,index)=>{
      const asset=item.assets?.find((row:Row)=>row.id===file.id);
      return <a className="download-file" href={`/api/media/${file.id}/download`} key={`${file.id}:${index}`}><span className="download-file-icon"><file.Icon size={20}/></span><span><strong>{file.label}</strong><small dir="auto">{asset?.original_name||'فایل اصلی'}{asset?.size?` • ${fileSize(asset.size)}`:''}</small></span><Download size={18}/></a>;
    })}</div>
    {!files.length&&<p className="notice">فایلی به این محتوا پیوست نشده است.</p>}
    {music?.url&&!music.audioId&&<p className="notice">برای موسیقی فقط پیوند ثبت شده و فایل صوتی پیوست نیست. <a href={music.url} target="_blank" rel="noreferrer">باز کردن پیوند موسیقی</a></p>}
    {music?.mode==='embedded'&&!music.audioId&&<p className="muted">صدا داخل ویدیوی اصلی است و همراه همان فایل دانلود می‌شود.</p>}
    {music?.mode==='instagram'&&<p className="muted">موسیقی هنگام انتشار در اینستاگرام اضافه می‌شود. {music.trackName||''} {music.notes||''}</p>}
  </section>;
}
export function ContentDownloads({id,onClose}:{id:string;onClose:()=>void}){
  const resource=useResource<Row>(`/content/${id}`);
  return <Modal title="دانلود فایل‌های اصلی محتوا" onClose={onClose} wide>{resource.loading?<Spinner/>:resource.error?<ErrorBox error={resource.error} retry={resource.refresh}/>:resource.data&&<DownloadPanel item={resource.data}/>}</Modal>;
}
