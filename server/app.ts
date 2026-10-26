import Fastify, {type FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {ZodError} from 'zod';
import {one} from './core/db.js';
import {HttpError,requireUser} from './core/security.js';
import {fileMaxBytes} from './core/storage.js';
import {registerAuth,sessionUser} from './modules/auth.js';
import {registerPages} from './modules/pages.js';
import {registerContent} from './modules/content.js';
import {registerScheduling} from './modules/scheduling.js';
import {registerStories} from './modules/stories.js';
import {registerMedia} from './modules/media.js';
import {registerTasks} from './modules/tasks.js';
import {registerAnalytics} from './modules/analytics.js';
import {registerReports} from './modules/reports.js';
import {registerNotifications} from './modules/notifications.js';

export async function createApp(options:{logger?:boolean;staticFiles?:boolean}={}):Promise<FastifyInstance>{
  const migrations=(await readdir(resolve('db/migrations'))).filter(name=>/^\d+_.*\.sql$/.test(name));
  const proxy=process.env.TRUST_PROXY;
  const app=Fastify({
    logger:options.logger===false?false:{level:process.env.LOG_LEVEL||'info',redact:['req.headers.cookie','req.headers.authorization','res.headers["set-cookie"]']},
    trustProxy:proxy && proxy!=='false' ? (_address:string,hop:number)=>hop<Math.max(0,Number(proxy)||0):false,
    bodyLimit:2*1024*1024,
    requestTimeout:Math.max(120_000,Number(process.env.UPLOAD_REQUEST_TIMEOUT_MS)||1_800_000),
  });
  app.decorateRequest('user',null);
  await app.register(cookie);
  await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],mediaSrc:["'self'",'blob:'],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:null}},hsts:process.env.APP_ORIGIN?.startsWith('https://')?{maxAge:31536000}:false});
  await app.register(rateLimit,{max:600,timeWindow:'1 minute'});
  await app.register(multipart,{limits:{fileSize:fileMaxBytes(),files:1,fields:8,parts:10}});
  app.addHook('onRequest',async(req,reply)=>{
    if(!req.url.startsWith('/api/'))return;
    reply.header('Cache-Control','private, no-store, max-age=0');
    reply.header('Vary','Cookie');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const expected=new URL(process.env.APP_ORIGIN||'http://localhost:3000').origin;
      const origin=req.headers.origin;
      if((origin && origin!==expected)||req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'درخواست از مبدأ نامعتبر است.');
    }
    req.user=await sessionUser(req.cookies.session);
    const path=req.url.split('?')[0];
    if(!['/api/health','/api/auth/login','/api/auth/logout'].includes(path))requireUser(req);
  });
  app.setErrorHandler((error:any,req,reply)=>{
    if(error instanceof ZodError){
      reply.code(422).send({error:'اطلاعات واردشده معتبر نیست.',code:'VALIDATION_ERROR',fields:error.issues.map((i)=>({path:i.path.join('.'),message:i.message}))});return;
    }
    if(error instanceof HttpError || error.statusCode>=400&&error.statusCode<500){reply.code(error.statusCode).send({error:error.message,code:error.code});return;}
    if(error.code==='23505'){reply.code(409).send({error:'این رکورد یا جایگاه قبلاً ثبت شده است.',code:'CONFLICT'});return;}
    if(['23503','22P02','22007','22008','23514'].includes(error.code)){reply.code(422).send({error:'رکورد یا مقدار انتخاب‌شده معتبر نیست.',code:'INVALID_REFERENCE'});return;}
    if(['40001','40P01'].includes(error.code)){reply.code(409).send({error:'اطلاعات هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',code:'CONCURRENT_CHANGE'});return;}
    req.log.error({code:error.code,name:error.name,requestId:req.id},'Request failed');
    reply.code(500).send({error:'خطای موقت سرور؛ دوباره تلاش کنید.',code:'INTERNAL_ERROR'});
  });
  app.get('/api/health',async()=>{
    try{
      const applied=await one('SELECT count(*)::int AS count FROM schema_migrations WHERE name=ANY($1::text[])',[migrations]);
      if(applied?.count!==migrations.length)throw new Error('Migration required');
    }catch{throw new HttpError(503,'پایگاه داده آماده نیست؛ مهاجرت‌ها را اجرا کنید.','MIGRATION_REQUIRED');}
    return {data:{status:'ok'}};
  });
  for(const register of [registerAuth,registerPages,registerContent,registerScheduling,registerStories,registerMedia,registerTasks,registerAnalytics,registerReports,registerNotifications])await register(app);
  const webRoot=resolve('dist/web');
  if(options.staticFiles!==false && existsSync(resolve(webRoot,'index.html'))){
    await app.register(staticPlugin,{root:webRoot,setHeaders(res,path){res.header('Cache-Control',path.endsWith('sw.js')||path.endsWith('index.html')?'no-cache':'public, max-age=3600');}});
    app.setNotFoundHandler((req,reply)=>{
      if(req.url.startsWith('/api/'))return reply.code(404).send({error:'مسیر پیدا نشد.'});
      if(req.method!=='GET')return reply.code(404).send({error:'مسیر پیدا نشد.'});
      return reply.header('Cache-Control','no-cache').sendFile('index.html');
    });
  }
  return app;
}
