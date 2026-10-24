import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { one, query, transaction } from '../core/db.js';
import { audit, hashPassword, HttpError, requireOwner, requireUser, verifyPassword, type User } from '../core/security.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const userFields = 'id,name,email,role,active,theme,avatar_id';
export async function sessionUser(token: string | undefined): Promise<User | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const user = await one(`SELECT ${userFields.split(',').map((f) => `u.${f}`).join(',')} FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.active`, [digest(token)]);
  if (!user) return null;
  return { ...user, permissions: await query('SELECT page_id,can_edit,can_suggest,can_report FROM permissions WHERE user_id=$1', [user.id]) } as User;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { email, password } = z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).parse(req.body);
    const record = await one('SELECT * FROM users WHERE email=lower($1) AND active', [email]);
    // Constant work even for nonexistent accounts, avoiding a fast account-enumeration path.
    const fallback = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64);
    if (!await verifyPassword(password, record?.password_hash || fallback) || !record) throw new HttpError(401, 'ایمیل یا رمز عبور صحیح نیست.');
    const token = randomBytes(32).toString('hex');
    const days = Math.min(30, Math.max(1, Number(process.env.SESSION_TTL_DAYS || 14)));
    await transaction(async (tx) => {
      await tx.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval '1 day')", [digest(token),record.id,days]);
      await audit(tx,record.id,'login','user',record.id);
    });
    reply.setCookie('session', token, {path:'/',httpOnly:true,secure:process.env.APP_ORIGIN?.startsWith('https://')??false,sameSite:'strict',maxAge:days*86400});
    return {data:await sessionUser(token)};
  });
  app.post('/api/auth/logout', async (req,reply) => {
    const token=req.cookies.session;
    if(token) await query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
    reply.clearCookie('session',{path:'/'});
    return {data:{ok:true}};
  });
  app.get('/api/auth/me', async (req) => ({data:requireUser(req)}));
  app.patch('/api/auth/me', async (req) => {
    const user=requireUser(req);
    const body=z.object({name:z.string().trim().min(1).max(100).optional(),theme:z.enum(['light','dark','system']).optional(),avatarId:z.uuid().nullable().optional(),password:z.string().min(12).max(256).optional(),currentPassword:z.string().max(256).optional()}).strict().parse(req.body);
    if(body.password){
      const record=await one('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if(!body.currentPassword || !await verifyPassword(body.currentPassword,record.password_hash)) throw new HttpError(400,'رمز عبور فعلی صحیح نیست.');
    }
    await transaction(async(tx)=>{
      if(body.avatarId){
        const asset=(await tx.query("SELECT id FROM assets WHERE id=$1 AND uploader_id=$2 AND purpose='profile_avatar' AND completed AND mime_type LIKE 'image/%' FOR SHARE",[body.avatarId,user.id])).rows[0];
        if(!asset) throw new HttpError(400,'فقط عکس پروفایل بارگذاری‌شده توسط خودتان قابل انتخاب است.');
      }
      if(body.avatarId!==undefined) await tx.query('UPDATE users SET avatar_id=$2 WHERE id=$1',[user.id,body.avatarId]);
      await tx.query('UPDATE users SET name=coalesce($2,name),theme=coalesce($3,theme),password_hash=coalesce($4,password_hash) WHERE id=$1',[user.id,body.name,body.theme,body.password ? await hashPassword(body.password):null]);
      if(body.password) await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,digest(req.cookies.session!)]);
      await audit(tx,user.id,'profile_update','user',user.id,{theme:body.theme,passwordChanged:Boolean(body.password),avatarChanged:body.avatarId!==undefined});
    });
    return {data:await sessionUser(req.cookies.session)};
  });
  app.get('/api/users', async(req)=>{
    const user=requireUser(req);requireOwner(user);
    const users=await query(`SELECT ${userFields},created_at FROM users ORDER BY created_at`);
    return {data:await Promise.all(users.map(async(row)=>({...row,permissions:await query('SELECT page_id,can_edit,can_suggest,can_report FROM permissions WHERE user_id=$1',[row.id])})))};
  });
  const perms=z.array(z.object({pageId:z.uuid(),canEdit:z.boolean(),canSuggest:z.boolean(),canReport:z.boolean()})).max(20);
  app.post('/api/users',async(req,reply)=>{
    const user=requireUser(req);requireOwner(user);
    const body=z.object({name:z.string().trim().min(1).max(100),email:z.email().max(254),password:z.string().min(12).max(256),permissions:perms.default([])}).strict().parse(req.body);
    const created=await transaction(async(tx)=>{
      const row=(await tx.query(`INSERT INTO users(name,email,password_hash) VALUES($1,lower($2),$3) RETURNING ${userFields}`,[body.name,body.email,await hashPassword(body.password)])).rows[0];
      for(const p of body.permissions) await tx.query('INSERT INTO permissions(user_id,page_id,can_edit,can_suggest,can_report) VALUES($1,$2,$3,$4,$5)',[row.id,p.pageId,p.canEdit,p.canSuggest,p.canReport]);
      await audit(tx,user.id,'create_member','user',row.id);
      return row;
    });
    reply.code(201);return {data:created};
  });
  app.patch('/api/users/:id',async(req)=>{
    const user=requireUser(req);requireOwner(user);
    const {id}=z.object({id:z.uuid()}).parse(req.params);
    const body=z.object({name:z.string().trim().min(1).max(100).optional(),active:z.boolean().optional(),password:z.string().min(12).max(256).optional(),permissions:perms.optional()}).strict().parse(req.body);
    return {data:await transaction(async(tx)=>{
      const target=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!target) throw new HttpError(404,'کاربر پیدا نشد.');
      if(target.role==='owner' && (body.active===false || body.permissions)) throw new HttpError(400,'دسترسی مالک اصلی قابل حذف نیست.');
      const row=(await tx.query(`UPDATE users SET name=coalesce($2,name),active=coalesce($3,active),password_hash=coalesce($4,password_hash) WHERE id=$1 RETURNING ${userFields}`,[id,body.name,body.active,body.password?await hashPassword(body.password):null])).rows[0];
      if(body.permissions){
        await tx.query('DELETE FROM permissions WHERE user_id=$1',[id]);
        for(const p of body.permissions) await tx.query('INSERT INTO permissions(user_id,page_id,can_edit,can_suggest,can_report) VALUES($1,$2,$3,$4,$5)',[id,p.pageId,p.canEdit,p.canSuggest,p.canReport]);
      }
      if(body.active===false || body.password) await tx.query('DELETE FROM sessions WHERE user_id=$1',[id]);
      await audit(tx,user.id,'update_member','user',id,{active:body.active,permissions:body.permissions,passwordChanged:Boolean(body.password)});
      return row;
    })};
  });
}
