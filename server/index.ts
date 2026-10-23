import {createApp} from './app.js';
import {pool} from './core/db.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
if(!process.env.APP_ORIGIN)throw new Error('APP_ORIGIN is required');
const origin=new URL(process.env.APP_ORIGIN);
if(process.env.NODE_ENV==='production' && !['localhost','127.0.0.1'].includes(origin.hostname) && origin.protocol!=='https:')throw new Error('Production APP_ORIGIN requires HTTPS');
const app=await createApp();
let closing=false;
async function shutdown(){
  if(closing)return;closing=true;
  try{await app.close();await pool.end();}catch{process.exitCode=1;}
}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
try{await app.listen({host:process.env.HOST||'0.0.0.0',port:Number(process.env.PORT||3000)});}catch(error){app.log.error(error);await shutdown();process.exitCode=1;}
