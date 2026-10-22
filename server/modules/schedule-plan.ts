export type Slot = {contentId: string; date: string; position: number; time: string|null};
export type ScheduleRequest = {operation:'swap'|'insert'|'delete'|'restore'; contentId:string; targetId?:string; slot?:{date:string;position:number;time?:string|null}};
export type ScheduleRule = {effective_date:string; posts_per_day:number; times:string[]};
const key = (s:Pick<Slot,'date'|'position'>) => `${s.date}:${String(s.position).padStart(4,'0')}`;
const order = (a:Slot,b:Slot) => key(a).localeCompare(key(b));
const nextDate = (date:string) => new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10);

/** Sparse queue policy: retain the occupied slot coordinates, rotate assignments through
 * them, and generate exactly one new tail coordinate when insertion needs capacity. */
export function planSchedule(source:Slot[], request:ScheduleRequest, rules:ScheduleRule[], locked:Slot[]=[]):Slot[] {
  const rows=source.map(x=>({...x})).sort(order);
  const current=rows.find(x=>x.contentId===request.contentId);
  if(request.operation==='swap') {
    const target=rows.find(x=>x.contentId===request.targetId);
    if(!current||!target||current===target) throw new Error('برای جابه‌جایی دو محتوای زمان‌بندی‌شده انتخاب کنید.');
    return rows.map(x=>x===current?{...target,contentId:current.contentId}:x===target?{...current,contentId:target.contentId}:x).sort(order);
  }
  const without=rows.filter(x=>x.contentId!==request.contentId);
  if(request.operation==='delete') {
    if(!current) return without;
    const i=rows.indexOf(current);
    return rows.slice(0,i).concat(rows.slice(i+1).map((item,j)=>({...rows[i+j]!,contentId:item.contentId})));
  }
  let destination=request.slot?{...request.slot,time:request.slot.time??null}:undefined;
  if(request.targetId) {
    const target=without.find(x=>x.contentId===request.targetId);
    if(!target) throw new Error('جایگاه مقصد پیدا نشد.');
    destination={date:target.date,position:target.position,time:target.time};
  }
  if(!destination) throw new Error('تاریخ و جایگاه مقصد را انتخاب کنید.');
  if(locked.some(x=>key(x)===key(destination!))) throw new Error('جایگاه محتوای منتشرشده قابل تغییر نیست.');
  const index=without.findIndex(x=>key(x)>=key(destination!));
  const at=index<0?without.length:index;
  const prefix=without.slice(0,at);
  const tail=without.slice(at);
  if(tail.length===0||key(tail[0]!)!==key(destination)) return [...prefix,{...destination,contentId:request.contentId},...tail];
  const last=tail[tail.length-1]!;
  let next={...last};
  do {
    const rule=[...rules].filter(x=>x.effective_date<=next.date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
    if(next.position<(rule?.posts_per_day??2)) next={...next,position:next.position+1};
    else next={...next,date:nextDate(next.date),position:1};
    const nextRule=[...rules].filter(x=>x.effective_date<=next.date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
    next.time=nextRule?.times[next.position-1]??null;
  } while(locked.some(x=>key(x)===key(next)));
  const coordinates=[...tail,next];
  return [...prefix,{...destination,contentId:request.contentId},...tail.map((x,i)=>({...coordinates[i+1]!,contentId:x.contentId}))];
}
