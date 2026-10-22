import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';

const scrypt = promisify(scryptCallback);
export interface Permission { page_id: string; can_edit: boolean; can_suggest: boolean; can_report: boolean }
export interface User { id: string; name: string; email: string; role: 'owner' | 'member'; active: boolean; theme: string; permissions: Permission[] }
declare module 'fastify' { interface FastifyRequest { user: User | null } }

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) { super(message); }
}
export function requireUser(request: FastifyRequest): User {
  if (!request.user?.active) throw new HttpError(401, 'لطفاً وارد حساب خود شوید.');
  return request.user;
}
export function requireOwner(user: User): void {
  if (user.role !== 'owner') throw new HttpError(403, 'این عملیات فقط برای مالک مجاز است.');
}
export function can(user: User, pageId: string, permission: 'edit' | 'suggest' | 'report'): boolean {
  return user.active && (user.role === 'owner' || user.permissions.some((p) => p.page_id === pageId && p[`can_${permission}`]));
}
export function authorize(user: User, pageId: string, permission: 'edit' | 'suggest' | 'report'): void {
  if (!can(user, pageId, permission)) throw new HttpError(403, 'شما اجازهٔ انجام این عملیات را ندارید.');
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) throw new HttpError(400, 'رمز عبور باید بین ۱۲ تا ۲۵۶ نویسه باشد.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [, salt, hex] = hash.split(':');
  if (!salt || !hex || password.length > 256) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export async function audit(client: PoolClient, actorId: string | null, action: string, targetType: string, targetId: string, detail: unknown = {}): Promise<void> {
  await client.query('INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,$3,$4,$5)', [actorId, action, targetType, targetId, JSON.stringify(detail)]);
}
export async function notify(client: PoolClient, userId: string, type: string, title: string, target: unknown, actorId?: string, dedupeKey?: string): Promise<void> {
  const result = await client.query('INSERT INTO notifications(user_id,type,title,target,actor_id,dedupe_key) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM users WHERE id=$1 AND active) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id', [userId, type, title, JSON.stringify(target), actorId ?? null, dedupeKey ?? null]);
  // Queue pushes only for actionable workflow events. Queue movement is in-app only.
  if (result.rows.length && !['move','delete','schedule','schedule_move','schedule_delete'].includes(type)) {
    const id = result.rows[0].id;
    await client.query("INSERT INTO jobs(dedupe_key,type,payload) VALUES($1,'push',$2) ON CONFLICT(dedupe_key) DO NOTHING", [`push:${id}`, JSON.stringify({notificationId:id,userId})]);
  }
}
