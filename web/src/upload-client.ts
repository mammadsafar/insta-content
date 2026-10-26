export const CHUNK_BYTES=2*1024*1024;
export function uploadError(status:number,message?:string){
 if(status===413)return 'اندازه درخواست از سقف سرور یا پراکسی بیشتر است. محدودیت فعال سرور و پراکسی را بررسی کنید.';
 if([408,504,524].includes(status))return 'مهلت ارتباط تمام شد. دوباره تلاش کنید؛ آپلود تکه‌ای از بخش تأییدشده ادامه پیدا می‌کند.';
 return message||`آپلود ناموفق بود (کد ${status}). دوباره تلاش کنید.`;
}
export function uploadRequest<T=any>(path:string,{method='GET',body,signal,onProgress}:{method?:string;body?:XMLHttpRequestBodyInit;signal:AbortSignal;onProgress?:(sent:number)=>void}):Promise<T>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();let settled=false;
  const finish=(error?:Error,value?:T)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
  const abort=()=>{xhr.abort();finish(new DOMException('بارگذاری متوقف شد','AbortError'));};
  if(signal.aborted){abort();return;}
  xhr.open(method,`/api${path}`);xhr.withCredentials=true;xhr.timeout=180000;
  if(typeof body==='string')xhr.setRequestHeader('Content-Type','application/json');
  else if(body instanceof Blob)xhr.setRequestHeader('Content-Type','application/octet-stream');
  signal.addEventListener('abort',abort,{once:true});
  xhr.upload.onprogress=event=>onProgress?.(event.loaded);
  xhr.onerror=()=>finish(new Error('ارتباط قطع شد؛ تلاش دوباره، فایل بزرگ را از بخش تأییدشده ادامه می‌دهد.'));
  xhr.ontimeout=()=>finish(new Error(uploadError(408)));
  xhr.onabort=()=>finish(new DOMException('بارگذاری متوقف شد','AbortError'));
  xhr.onload=()=>{
   let value:any;try{value=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status===401)window.dispatchEvent(new Event('session-expired'));
   if(xhr.status<200||xhr.status>=300){finish(new Error(uploadError(xhr.status,value?.error)));return;}
   if(!value?.data){finish(new Error('پاسخ آپلود معتبر نیست. دوباره تلاش کنید.'));return;}
   finish(undefined,value.data);
  };
  xhr.send(body);
 });
}
