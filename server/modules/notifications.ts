import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query,one} from '../core/db.js';
import {HttpError,requireUser} from '../core/security.js';

/** Only established browser push services may receive authenticated outbound requests. */
export function isPublicPushEndpoint(endpoint:string):boolean{
  try{
    const url=new URL(endpoint),h=url.hostname.toLowerCase();
    return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&!url.hash&&
      (h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.notify.windows.com'));
  }catch{return false;}
}
export function vapidConfiguration(env:NodeJS.ProcessEnv=process.env):{enabled:boolean;publicKey:string|null;issue:'missing'|'invalid'|null}{
  const publicKey=env.VAPID_PUBLIC_KEY?.trim()??'',privateKey=env.VAPID_PRIVATE_KEY?.trim()??'',subject=env.VAPID_SUBJECT?.trim()??'';
  if(!publicKey||!privateKey||!subject)return {enabled:false,publicKey:null,issue:'missing'};
  const decode=(value:string,bytes:number)=>/^[A-Za-z0-9_-]+={0,2}$/.test(value)&&Buffer.from(value,'base64url').length===bytes;
  const validSubject=/^mailto:[^\s@]+@[^\s@]+$/.test(subject)||(()=>{try{const url=new URL(subject);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}})();
  const valid=decode(publicKey,65)&&Buffer.from(publicKey,'base64url')[0]===4&&decode(privateKey,32)&&validSubject;
  return valid?{enabled:true,publicKey,issue:null}:{enabled:false,publicKey:null,issue:'invalid'};
}
export async function registerNotifications(app:FastifyInstance):Promise<void>{
  app.get('/api/notifications',async req=>{const user=requireUser(req);return {data:await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[user.id])};});
  app.patch('/api/notifications/:id',async req=>{
    const user=requireUser(req),id=z.object({id:z.uuid()}).parse(req.params).id;z.object({read:z.literal(true)}).parse(req.body);
    const data=await one('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *',[id,user.id]);
    if(!data)throw new HttpError(404,'اعلان پیدا نشد.');return {data};
  });
  app.get('/api/push/config',async req=>{requireUser(req);return {data:vapidConfiguration()};});
  app.post('/api/push/subscriptions',async req=>{
    const user=requireUser(req),b=z.object({endpoint:z.string().max(4096),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{80,100}={0,2}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{20,30}={0,2}$/)})}).parse(req.body);
    if(!isPublicPushEndpoint(b.endpoint))throw new HttpError(400,'نشانی سرویس اعلان مجاز نیست.');
    await query('INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,created_at=now()',[user.id,b.endpoint,JSON.stringify(b)]);
    return {data:{subscribed:true}};
  });
  app.delete('/api/push/subscriptions',async req=>{
    const user=requireUser(req),b=z.object({endpoint:z.string().max(4096)}).parse(req.body);await query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[user.id,b.endpoint]);return {data:{subscribed:false}};
  });
}
