import { env } from 'cloudflare:workers';
import { getDatabase } from '@/db';
import {
  DEFAULT_ROOM,
  isStaffEmail,
  type StaffRole,
  type TableScope,
} from './access-policy';
import { TABLES } from './order-model';
export const validRoom = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
export const settings = () =>
  env as typeof env & {
    CASHIER_ALLOWED_EMAILS?: string;
    KITCHEN_ALLOWED_EMAILS?: string;
    MANAGER_ALLOWED_EMAILS?: string;
    TABLE_LINK_SECRET?: string;
  };
export function staffAllowed(headers: Headers, role: StaffRole) {
  const userId = headers.get('oai-authenticated-user-id');
  const email = headers.get('oai-authenticated-user-email');
  return (
    !!userId &&
    isStaffEmail(
      email,
      role === 'manager'
        ? settings().MANAGER_ALLOWED_EMAILS
        : role === 'cashier'
          ? settings().CASHIER_ALLOWED_EMAILS
          : settings().KITCHEN_ALLOWED_EMAILS,
    )
  );
}
async function signingKey() {
  const secret = settings().TABLE_LINK_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Table signing unavailable');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function tableToken(room: string, table: string) {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(`onmenu:v1:${room}:${table}`),
  );
  return Array.from(new Uint8Array(signature), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
export async function validScope(scope: TableScope) {
  if (
    !validRoom(scope.room) ||
    !TABLES.includes(scope.table as (typeof TABLES)[number]) ||
    scope.table === 'counter' ||
    !/^[0-9a-f]{64}$/.test(scope.token)
  )
    return false;
  return crypto.subtle.verify(
    'HMAC',
    await signingKey(),
    Uint8Array.from(scope.token.match(/../g)!, (h) => parseInt(h, 16)),
    new TextEncoder().encode(`onmenu:v1:${scope.room}:${scope.table}`),
  );
}
export async function defaultScope(): Promise<TableScope> {
  return {
    room: DEFAULT_ROOM,
    table: '01',
    token: await tableToken(DEFAULT_ROOM, '01'),
  };
}
export function scopeFrom(request: Request): TableScope {
  const u = new URL(request.url);
  return {
    room: u.searchParams.get('room') ?? '',
    table: u.searchParams.get('table') ?? '',
    token: u.searchParams.get('token') ?? '',
  };
}
export async function guestLinks(room: string) {
  return Object.fromEntries(
    await Promise.all(
      TABLES.filter((t) => t !== 'counter').map(async (table) => [
        table,
        `/order?${new URLSearchParams({ room, table, token: await tableToken(room, table) })}`,
      ]),
    ),
  );
}
export { getDatabase };
