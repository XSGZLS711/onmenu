import { getDatabase } from '@/db';
import {
  applyCommand,
  emptyState,
  RuleError,
  type Command,
  type DemoState,
} from '@/lib/order-model';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const roomId = (request: Request) =>
  new URL(request.url).searchParams.get('room') ?? '';
const validRoom = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
async function readRoom(id: string) {
  const db = getDatabase();
  let row = await db
    .prepare('SELECT state, revision FROM demo_rooms WHERE id = ?')
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
      .prepare('SELECT state, revision FROM demo_rooms WHERE id = ?')
      .bind(id)
      .first<{ state: string; revision: number }>();
  }
  if (!row) throw new Error('Room unavailable');
  return row;
}
export async function GET(request: Request) {
  try {
    const room = roomId(request);
    if (!validRoom(room))
      return Response.json({ error: 'INVALID' }, { status: 400, headers });
    const row = await readRoom(room);
    return Response.json(JSON.parse(row.state), { headers });
  } catch {
    return Response.json({ error: 'UNAVAILABLE' }, { status: 503, headers });
  }
}
export async function POST(request: Request) {
  try {
    const room = roomId(request);
    if (!validRoom(room))
      return Response.json({ error: 'INVALID' }, { status: 400, headers });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: 'INVALID' }, { status: 403, headers });
    const body = await request.text();
    if (body.length > 8192)
      return Response.json({ error: 'INVALID' }, { status: 413, headers });
    let cmd: Command;
    try {
      cmd = JSON.parse(body);
    } catch {
      return Response.json({ error: 'INVALID' }, { status: 400, headers });
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await readRoom(room),
        before: DemoState = JSON.parse(row.state),
        next = applyCommand(before, cmd);
      if (next === before) return Response.json(before, { headers });
      const result = await getDatabase()
        .prepare(
          'UPDATE demo_rooms SET state = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?',
        )
        .bind(
          JSON.stringify(next),
          next.revision,
          new Date().toISOString(),
          room,
          row.revision,
        )
        .run();
      if (result.meta.changes === 1) return Response.json(next, { headers });
    }
    return Response.json({ error: 'BUSY' }, { status: 409, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof RuleError ? error.code : 'UNAVAILABLE' },
      { status: error instanceof RuleError ? 409 : 503, headers },
    );
  }
}
