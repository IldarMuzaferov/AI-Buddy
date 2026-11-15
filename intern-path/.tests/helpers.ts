import { readFile } from 'node:fs/promises';
import { createApi } from '@/shared/api/endpoints';
import { mockRequest } from '@/shared/api/mock/router';
import { reset } from '@/shared/api/mock/data';
import type { RequestMethod } from '@/shared/api/transport';
import { vi } from 'vitest';

export const guest = createApi({ backend: 'mock', token: null });
export const intern = createApi({ backend: 'mock', token: 'mock:anya' });
export const dima = createApi({ backend: 'mock', token: 'mock:dima' });
export const mentor = createApi({ backend: 'mock', token: 'mock:boris' });

export function resetDemo() {
  localStorage.clear();
  reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/assets/export-font.ttf') {
        return new Response(new Uint8Array(await readFile('public/assets/export-font.ttf')));
      }
      if (!url.startsWith('/api/')) throw new Error(`Unexpected request: ${url}`);
      const headers = new Headers(init?.headers);
      const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      return mockRequest(
        url.slice(4),
        {
          method: init?.method as RequestMethod | undefined,
          body,
          signal: init?.signal ?? undefined,
          idempotencyKey: headers.get('Idempotency-Key') ?? undefined,
        },
        token,
      );
    }),
  );
}

export async function ask(text: string, chatId?: string, mode: 'guide' | 'direct' = 'guide') {
  const id = chatId ?? (await intern.chats.create()).id;
  const events: import('@/shared/api/contracts').StreamEvent[] = [];
  const completion = intern.chats.send(
    id,
    { text, mode, attachment_ids: [] },
    crypto.randomUUID(),
    (event) => events.push(event),
    new AbortController().signal,
  );
  await completion;
  return { id, events };
}
