// GitHub Pages demonstration only. Never used by the hosted order APIs.
// IndexedDB read/write transactions serialize updates across browser tabs.
import {
  applyCommand,
  emptyState,
  RuleError,
  TABLES,
  type Command,
  type DemoState,
  type Role,
} from '../lib/order-model.ts';
import { ROLE_ACTIONS, projectState } from '../lib/access-policy.ts';

export function createDemoRequest(
  factory: IDBFactory,
  databaseName = 'onmenu-pages-demo-v1',
) {
  let connection: Promise<IDBDatabase> | undefined;
  function database() {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('rooms');
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
    });
    return connection;
  }
  async function update(
    room: string,
    transform: (state: DemoState) => DemoState,
  ) {
    const db = await database();
    return new Promise<DemoState>((resolve, reject) => {
      const tx = db.transaction('rooms', 'readwrite');
      const store = tx.objectStore('rooms');
      const request = store.get(room);
      let result: DemoState;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const previous = request.result ?? emptyState();
          result = transform(previous);
          if (!request.result || result !== previous) store.put(result, room);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error('Storage unavailable'));
      tx.onerror = () => {
        failure ??= tx.error;
      };
    });
  }
  return async function request(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      const url = new URL(path, 'https://demo.invalid');
      const match = /^\/api\/(guest|staff\/(cashier|kitchen|manager))$/.exec(
        url.pathname,
      );
      if (!match) return Response.json({ error: 'ACCESS' }, { status: 403 });
      const role = (match[2] ?? 'guest') as Role;
      const room = url.searchParams.get('room') ?? '';
      const table = url.searchParams.get('table') ?? '';
      const guestId = new Headers(init?.headers).get('X-OnMenu-Guest') ?? '';
      if (
        !/^[0-9a-f-]{36}$/i.test(room) ||
        (role === 'guest' &&
          (!TABLES.some((t) => t === table && t !== 'counter') ||
            !/^[0-9a-f-]{36}$/i.test(guestId)))
      ) {
        return Response.json({ error: 'ACCESS' }, { status: 403 });
      }
      const method = init?.method ?? 'GET';
      if (!['GET', 'POST'].includes(method))
        return Response.json({ error: 'INVALID' }, { status: 405 });
      let command: Command | undefined;
      if (method === 'POST') {
        const input = JSON.parse(String(init?.body ?? 'null')) as Command;
        if (!input || !ROLE_ACTIONS[role].includes(input.type))
          return Response.json({ error: 'ROLE' }, { status: 403 });
        if (role === 'guest' && input.table && input.table !== table)
          return Response.json({ error: 'ACCESS' }, { status: 403 });
        command = {
          ...input,
          role,
          actor: 'Browser demo / ' + role,
          ...(role === 'guest'
            ? { table, guestId, by: 'Guest' }
            : { by: 'Cashier' }),
        };
      } else if (role === 'guest') {
        command = {
          id: crypto.randomUUID(),
          type: 'join',
          role,
          table,
          guestId,
        };
      }
      const state = await update(room, (previous) =>
        command ? applyCommand(previous, command) : previous,
      );
      return Response.json(projectState(state, role, table, guestId));
    } catch (error) {
      return Response.json(
        { error: error instanceof RuleError ? error.code : 'UNAVAILABLE' },
        { status: error instanceof RuleError ? 409 : 503 },
      );
    }
  };
}
