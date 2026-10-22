/** Iran has observed UTC+03:30 year-round since 2023. Business dates use Intl. */
export function localDate(instant = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  return ['year','month','day'].map(k=>p.find(v=>v.type===k)!.value).join('-');
}
export function addDays(date:string, days:number):string {
  return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);
}
export function iranInstant(date:string,time='09:00'):Date { return new Date(`${date}T${time}:00+03:30`); }
export function weeklyPeriod(instant = new Date()):{start:string,end:string} {
  const today=localDate(instant), day=new Date(`${today}T12:00:00Z`).getUTCDay();
  const end=addDays(today,-((day+1)%7));
  return {start:addDays(end,-7),end};
}
export function nextDayReminder(publishedAt:Date,time='09:00'):Date { return iranInstant(addDays(localDate(publishedAt),1),time); }
