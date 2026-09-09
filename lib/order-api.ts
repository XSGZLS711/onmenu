import {
  getDatabase,
  staffAllowed,
  validScope,
  scopeFrom,
  validRoom,
} from './server-access';
import {
  applyCommand,
  emptyState,
  RuleError,
  type Command,
  type DemoState,
  type Role,
} from './order-model';
import { ROLE_ACTIONS, projectState, type StaffRole } from './access-policy';
const headers = { 'Cache-Control': 'no-store' };
async function readRoom(id: string) {
  const db = getDatabase();
  let row = await db
    .prepare('SELECT state,revision FROM demo_rooms WHERE id=?')
    .bind(id)
    .first<{ state: string; revision: number }>();
  if (!row) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO demo_rooms (id,state,revision,updated_at) VALUES (?,?,0,?)',
      )
      .bind(id, JSON.stringify(emptyState()), new Date().toISOString())
      .run();
    row = await db
      .prepare('SELECT state,revision FROM demo_rooms WHERE id=?')
      .bind(id)
      .first<{ state: string; revision: number }>();
  }
  if (!row) throw new Error('Unavailable');
  return row;
}
async function update(room: string, cmd: Command) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await readRoom(room),
      before: DemoState = JSON.parse(row.state),
      next = applyCommand(before, cmd);
    if (next === before) return before;
    const result = await getDatabase()
      .prepare(
        'UPDATE demo_rooms SET state=?,revision=?,updated_at=? WHERE id=? AND revision=?',
      )
      .bind(
        JSON.stringify(next),
        next.revision,
        new Date().toISOString(),
        room,
        row.revision,
      )
      .run();
    if (result.meta.changes === 1) return next;
  }
  throw new RuleError('BUSY');
}
export async function handleOrderRequest(request: Request, role: Role) {
  try {
    const scope = scopeFrom(request),
      room = scope.room;
    if (!validRoom(room))
      return Response.json({ error: 'INVALID' }, { status: 400, headers });
    const guestId = request.headers.get('X-OnMenu-Guest') ?? '';
    if (role === 'guest') {
      if (!(await validScope(scope)) || !validRoom(guestId))
        return Response.json({ error: 'ACCESS' }, { status: 403, headers });
    } else if (!staffAllowed(request.headers, role as StaffRole))
      return Response.json({ error: 'ACCESS' }, { status: 403, headers });
    if (request.method === 'GET') {
      const data =
        role === 'guest'
          ? await update(room, {
              id: crypto.randomUUID(),
              type: 'join',
              role,
              table: scope.table,
              guestId,
            })
          : JSON.parse((await readRoom(room)).state);
      return Response.json(projectState(data, role, scope.table, guestId), {
        headers,
      });
    }
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: 'ACCESS' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.includes('application/json'))
      return Response.json({ error: 'INVALID' }, { status: 415, headers });
    const body = await request.text();
    if (body.length > 8192)
      return Response.json({ error: 'INVALID' }, { status: 413, headers });
    let input: Command;
    try {
      input = JSON.parse(body);
    } catch {
      return Response.json({ error: 'INVALID' }, { status: 400, headers });
    }
    if (
      !input ||
      typeof input !== 'object' ||
      !ROLE_ACTIONS[role].includes(input.type)
    )
      return Response.json({ error: 'ROLE' }, { status: 403, headers });
    const cmd: Command = {
      ...input,
      role,
      actor:
        role === 'guest'
          ? 'Guest'
          : (request.headers.get('oai-authenticated-user-email') ?? undefined),
    };
    if (role === 'guest') {
      if (input.table && input.table !== scope.table)
        return Response.json({ error: 'ACCESS' }, { status: 403, headers });
      cmd.table = scope.table;
      cmd.guestId = guestId;
      cmd.by = 'Guest';
    } else cmd.by = role === 'cashier' ? 'Cashier' : input.by;
    const next = await update(room, cmd);
    return Response.json(projectState(next, role, scope.table, guestId), {
      headers,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof RuleError ? error.code : 'UNAVAILABLE' },
      { status: error instanceof RuleError ? 409 : 503, headers },
    );
  }
}
