import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApi } from '@/shared/api/endpoints';
import { createTransport } from '@/shared/api/transport';
import { mockRequest } from '@/shared/api/mock/router';
import type { StreamEvent } from '@/shared/api/contracts';
import { ask, dima, guest, intern, mentor, resetDemo } from './helpers';

beforeEach(resetDemo);
afterEach(() => vi.unstubAllGlobals());

describe('Demo API', () => {
  it('authenticates roles and exposes public health and operational data', async () => {
    expect((await guest.auth.users()).map((user) => user.id)).toEqual([
      'anya',
      'dima',
      'boris',
      'maria',
    ]);
    expect((await guest.auth.login('anya')).user.intern?.day).toBe(12);
    expect((await guest.auth.login('boris')).user.role).toBe('mentor');
    await expect(guest.auth.login('maria')).rejects.toMatchObject({ status: 403 });
    await expect(guest.auth.login('unknown')).rejects.toMatchObject({ status: 404 });
    await expect(guest.auth.login('   ')).rejects.toMatchObject({ status: 400 });
    await expect(guest.auth.me()).rejects.toMatchObject({ status: 401 });
    await expect(intern.mentor.interns()).rejects.toMatchObject({ status: 403 });
    await expect(mentor.chats.list()).rejects.toMatchObject({ status: 403 });
    expect((await intern.privacy.get()).access_log[0].decision).toBe('deny');
    expect((await guest.system.health()).dev_mode).toBe(true);
    expect(await guest.system.metrics()).toContain('intern_path_mock_up');
    expect(await intern.system.flags()).toEqual({ guide_mode_default: 'guide' });
    expect(await intern.system.search('Billing')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('Billing') }),
      ]),
    );
    await expect(intern.system.summary()).rejects.toMatchObject({ status: 403 });
    expect(await mentor.system.summary()).toMatchObject({ answers: expect.any(Number) });
    await expect(intern.system.event('privacy_opened')).resolves.toBeUndefined();
    expect((await mockRequest('/unknown', {}, 'mock:anya')).status).toBe(404);
  });

  it('updates first-entry state, checklist, practice and onboarding day', async () => {
    await intern.auth.acknowledge();
    expect((await intern.auth.me()).privacy?.seen_privacy).toBe(true);
    expect((await dima.auth.me()).intern?.is_absent_today).toBe(true);
    expect((await dima.home()).digest).toBeNull();
    const steps = (await intern.checklist.list()).stages.flatMap((stage) => stage.steps);
    const withPractice = steps.find((step) => step.has_practice)!;
    const withoutPractice = steps.find((step) => !step.has_practice)!;
    await expect(intern.checklist.generate(withoutPractice.id)).rejects.toMatchObject({
      code: 'no_practice',
    });
    const pack = await intern.checklist.generate(withPractice.id);
    expect(await intern.practice.set(pack.items[0].id, 'done')).toMatchObject({ status: 'done' });
    expect(await intern.practice.list()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pack.items[0].id, status: 'done' })]),
    );
    for (const step of steps) await intern.checklist.set(step.id, 'done');
    expect((await intern.home()).next_step).toBeNull();
    await intern.dev.advance('anya', 500);
    expect((await intern.home()).day).toBe(180);
    await expect(intern.dev.advance('unknown', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('synchronizes tasks, notifications, locked folders and role visibility', async () => {
    const task = await mentor.mentor.createTask({
      intern_id: 'dima',
      title: 'Ревью',
      description: 'Итоги',
      deadline: '2026-12-01',
    });
    const notifications = await dima.notifications.list();
    expect(notifications.unread).toBe(1);
    await dima.notifications.read(notifications.items[0].id);
    expect((await dima.notifications.list()).unread).toBe(0);
    await intern.notifications.readAll();
    expect((await intern.notifications.list()).unread).toBe(0);
    await expect(intern.tasks.get(task.id)).rejects.toMatchObject({ status: 404 });
    const chat = await dima.chats.create({ task_id: task.id, title: 'Вопрос' });
    await dima.dev.updateTask({
      task_id: task.id,
      status: 'done',
      description: 'Готово',
      deadline: '2026-12-02',
      shift_days: 2,
    });
    expect(await dima.tasks.get(task.id)).toMatchObject({
      deadline: '2026-12-04',
      can_create_chat: false,
      chats: [expect.objectContaining({ id: chat.id })],
    });
    await expect(dima.chats.create({ task_id: task.id })).rejects.toMatchObject({ status: 409 });
    await expect(dima.chats.attach(chat.id, new File(['hi'], 'notes.txt'))).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      dima.chats.send(
        chat.id,
        { text: 'Привет', mode: 'guide', attachment_ids: [] },
        'key',
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await dima.tasks.list())[0].locked).toBe(true);
    const created = await intern.dev.createTask({ intern_id: 'anya', title: 'Проверка трекера' });
    expect(created).toMatchObject({ title: 'Проверка трекера' });
    await expect(
      intern.dev.createTask({ intern_id: 'unknown', title: 'Ошибка' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await intern.dev.sync()).toEqual({ synced: true });
    await intern.dev.reset();
    expect(await dima.tasks.list()).toEqual([]);
  });

  it('edits a chat, streams attachments and replays a message idempotently', async () => {
    const chat = await intern.chats.create();
    await intern.chats.edit(chat.id, { include_in_journal: true });
    const file = await intern.chats.attach(chat.id, new File(['log'], 'app.log'));
    await expect(
      intern.chats.attach(chat.id, new File(['sample'], 'capture.png')),
    ).resolves.toMatchObject({ kind: 'image' });
    await expect(
      intern.chats.attach(chat.id, new File(['sample'], 'bad.exe')),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      intern.chats.attach(chat.id, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.txt')),
    ).rejects.toMatchObject({ status: 413 });
    expect(
      (await mockRequest(`/chats/${chat.id}/attachments`, { method: 'POST' }, 'mock:anya')).status,
    ).toBe(400);
    const body = {
      text: 'Как создать dev-ветку?',
      mode: 'guide' as const,
      attachment_ids: [file.id],
    };
    const events: StreamEvent[] = [];
    const signal = new AbortController().signal;
    await intern.chats.send(chat.id, body, 'same-key', (event) => events.push(event), signal);
    expect(events.map((event) => event.name)).toEqual(
      expect.arrayContaining(['status', 'token', 'source', 'done']),
    );
    const history = await intern.chats.messages(chat.id);
    expect(history.chat.title).toBe(body.text);
    expect(history.messages[0].attachments?.[0]).toMatchObject({
      id: file.id,
      filename: 'app.log',
    });
    const answer = history.messages[1];
    expect(answer.guide?.step).toBe(1);
    await intern.chats.send(
      chat.id,
      body,
      'same-key',
      (event) => {
        if (event.name === 'done') expect(event.data.replayed).toBe(true);
      },
      signal,
    );
    expect((await intern.chats.messages(chat.id)).messages).toHaveLength(2);
    expect((await intern.chats.feedback(answer.id, false)).chat_unresolved).toBe(true);
    await intern.chats.followUp(answer.id, 'direct', () => {}, signal);
    await expect(intern.chats.followUp(answer.id, 'retry', () => {}, signal)).rejects.toMatchObject(
      { status: 400 },
    );
    const directAnswer = (await intern.chats.messages(chat.id)).messages.at(-1)!;
    await expect(
      intern.chats.followUp(directAnswer.id, 'direct', () => {}, signal),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      intern.chats.send(
        chat.id,
        { ...body, text: '', attachment_ids: [] },
        'empty',
        () => {},
        signal,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      intern.chats.send(
        chat.id,
        { ...body, attachment_ids: ['foreign'] },
        'missing',
        () => {},
        signal,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(dima.chats.messages(chat.id)).rejects.toMatchObject({ status: 404 });
    await intern.chats.remove(chat.id);
    await expect(intern.chats.messages(chat.id)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['Кто отвечает за сервис платежей?', 'person_card'],
    ['Что делать дальше?', 'next_step'],
    ['Дай практику Grafana', 'practice'],
    ['Дай практику для стенда', 'practice'],
    ['Дай практику', 'practice'],
    ['Глобальное пространство', 'notice'],
    ['Как получить доступ к тестовому стенду?', 'conflict'],
    ['Где конфиг Billing?', 'source'],
    ['Где метрики Grafana?', 'person_card'],
    ['Мне тяжело', 'person_card'],
    ['Незнакомая тема', 'person_card'],
    ['Ревью изменений', 'source'],
    ['Упал пайплайн', 'source'],
  ])('delivers the expected SSE block for %s', async (text, name) => {
    const { events } = await ask(text);
    expect(events.some((event) => event.name === name)).toBe(true);
    expect(events.at(-1)?.name).toBe('done');
  });

  it('advances consecutive guide steps and gives a direct answer after the final hint', async () => {
    const { id } = await ask('Как создать dev-ветку?');
    const next = await ask('Ключ PAY-214', id);
    expect(next.events.at(-1)).toMatchObject({ name: 'done', data: { guide: { step: 2 } } });
    const final = await ask('Готово', id);
    expect(final.events.at(-1)).toMatchObject({ name: 'done', data: { guide: null } });
  });

  it('retries an injected model error without duplicating the user message', async () => {
    await intern.dev.failNext(true);
    const { id, events } = await ask('Кто отвечает за сервис платежей?');
    expect(events.some((event) => event.name === 'error')).toBe(true);
    const failed = (await intern.chats.messages(id)).messages.at(-1)!;
    await intern.chats.followUp(failed.id, 'retry', () => {}, new AbortController().signal);
    const { messages } = await intern.chats.messages(id);
    expect(messages).toHaveLength(2);
    expect(messages[1].route).toBe('lookup');
  });

  it('edits, confirms, approves, rejects and cancels action drafts', async () => {
    expect((await intern.actions.presets()).defaults).toMatchObject({ project_key: 'PAY' });
    await ask('Как запросить доступ к Jira-проекту PAY?');
    const [draft] = await intern.actions.list('access_request');
    await expect(intern.actions.reminder(draft.id)).rejects.toMatchObject({ status: 409 });
    await expect(intern.dev.approve(draft.id)).rejects.toMatchObject({ status: 409 });
    await intern.actions.edit(draft.id, { justification: 'Доступ для проверки' });
    const confirmed = await intern.actions.confirm(draft.id);
    expect(confirmed.external_status).toBe('pending');
    expect(await intern.actions.confirm(draft.id)).toEqual(confirmed);
    await expect(intern.actions.edit(draft.id, { level: 'write' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(intern.actions.cancel(draft.id)).rejects.toMatchObject({ status: 409 });
    expect((await intern.actions.reminder(draft.id)).text).toContain(confirmed.external_id);
    await intern.dev.approve(draft.id);
    expect(await intern.actions.get(draft.id)).toMatchObject({
      external_status: 'granted',
      checklist_prompt: { step_id: 'w24-access' },
    });
    await ask('Доступ к Jira');
    const [pending] = await intern.actions.list('access_request');
    await intern.actions.confirm(pending.id);
    await intern.dev.reject(pending.id, 'Уточнить права');
    expect((await intern.actions.get(pending.id)).external_status).toBe('rejected');
    await ask('Доступ к Jira');
    const [restricted] = await intern.actions.list('access_request');
    await intern.actions.edit(restricted.id, { space_or_page: 'Глобальное пространство' });
    await expect(intern.actions.confirm(restricted.id)).rejects.toMatchObject({ status: 403 });
    expect((await intern.actions.get(restricted.id)).status).toBe('failed');
    await ask('Как оформить отгул?');
    const [absence] = await intern.actions.list('absence_request');
    await intern.actions.edit(absence.id, {
      date_from: '2026-12-02',
      date_to: '2026-12-01',
      reason: 'Семья',
    });
    await expect(intern.actions.confirm(absence.id)).rejects.toMatchObject({ status: 400 });
    await intern.actions.edit(absence.id, { date_to: '2026-12-03' });
    await intern.actions.confirm(absence.id);
    expect((await mentor.mentor.interns()).interns[0].absences).toHaveLength(1);
    await ask('Отпуск');
    const [cancelled] = await intern.actions.list('absence_request');
    expect((await intern.actions.cancel(cancelled.id)).status).toBe('cancelled');
    await expect(intern.actions.confirm(cancelled.id)).rejects.toMatchObject({ status: 409 });
    const [conflict] = await intern.actions.list('doc_conflict_report');
    expect((await intern.actions.confirm(conflict.id)).issue_id).toMatch(/^DOC-/);
    expect((await mentor.mentor.interns()).interns[0].doc_issues).toHaveLength(1);
  });

  it('handles contacts, journal export, privacy and records remaining after a chat deletion', async () => {
    const { id } = await ask('Кто отвечает за сервис платежей?');
    const contact = await intern.contacts.create({
      person_id: 'igor',
      source_chat_id: id,
      how_to_ask: 'Вопрос по Billing',
    });
    await expect(
      intern.contacts.create({ person_id: 'igor', source_chat_id: id }),
    ).rejects.toMatchObject({ status: 409 });
    await intern.contacts.edit(contact.id, { note: 'Написать утром' });
    expect((await intern.contacts.list('утром'))[0].id).toBe(contact.id);
    const manual = await intern.contacts.create({
      name: 'Вера',
      role: 'QA',
      team: 'Payments',
      topics: ['Тесты'],
      note: '',
    });
    await intern.contacts.remove(manual.id);
    expect((await intern.journal.suggest([id])).items).toHaveLength(1);
    const empty = await intern.chats.create();
    expect((await intern.journal.suggest([empty.id])).items).toEqual([]);
    const {
      entries: [entry],
    } = await intern.journal.add([{ text: 'Проверка кириллицы', source_chat_id: id }]);
    await intern.journal.edit(entry.id, { shared_with_mentor: true });
    await intern.privacy.set(true);
    expect((await mentor.mentor.interns()).interns[0]).toMatchObject({
      topic: 'Платёжный модуль',
      shared_journal: [expect.objectContaining({ id: entry.id })],
    });
    const draft = await intern.journal.draft([entry.id]);
    expect(draft.text).toBe(entry.text);
    expect((await intern.journal.draft([])).entry_ids).toContain(entry.id);
    const pdf = await intern.journal.export({
      text: (draft.text + '\n').repeat(75) + 'Длинная строка '.repeat(30),
    });
    expect(pdf.type).toBe('application/pdf');
    expect(await pdf.slice(0, 5).text()).toBe('%PDF-');
    await intern.privacy.clear();
    expect(
      (await intern.journal.list()).entries.find((item) => item.id === entry.id)?.chat_deleted,
    ).toBe(true);
    expect((await intern.contacts.list()).some((item) => item.id === contact.id)).toBe(true);
    await intern.journal.remove(entry.id);
    expect((await intern.journal.list()).entries.some((item) => item.id === entry.id)).toBe(false);
  });
});

describe('HTTP and SSE transport', () => {
  const server = createTransport({ backend: 'server', token: 'secret' });

  it('serializes API requests and uploads FormData without replacing the browser boundary', async () => {
    const api = createApi({ backend: 'server', token: 'mock:anya' });
    expect((await api.auth.me()).id).toBe('anya');
    const chat = await api.chats.create();
    await api.chats.attach(chat.id, new File(['test'], 'sample.txt'));
    const calls = vi.mocked(fetch).mock.calls;
    expect(new Headers(calls[0][1]?.headers).get('Authorization')).toBe('Bearer mock:anya');
    expect(calls[1][1]?.body).toBe('{}');
    expect(calls[2][1]?.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[2][1]?.headers).has('Content-Type')).toBe(false);
  });

  it('distinguishes network, abort, HTTP and invalid contract errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(server.json('/broken', z.string())).rejects.toMatchObject({
      status: 0,
      code: 'network',
    });
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValueOnce(controller.signal.reason);
    await expect(
      server.json('/broken', z.string(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('proxy error', { status: 502 }));
    await expect(server.json('/broken', z.string())).rejects.toMatchObject({
      status: 502,
      code: 'http_error',
    });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ notValue: 1 }));
    await expect(server.json('/broken', z.object({ value: z.string() }))).rejects.toMatchObject({
      code: 'invalid_response',
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(server.json('/empty', z.undefined())).resolves.toBeUndefined();
  });

  it('parses split chunks, CRLF, comments, multiline data and unknown events', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      ': heartbeat\r\n\r\nevent: ignored\r\ndata: {}\r\n\r\nevent: to',
      'ken\r\ndata: {\r\ndata: "text":"Привет"}\r\n\r\n',
      'event: done\ndata: {"message_id":"m","route":"lookup","mode":"guide"}\n\n',
    ];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const onEvent = vi.fn();
    await server.stream('/chat', { method: 'POST', idempotencyKey: 'retry-key' }, onEvent);
    expect(onEvent.mock.calls.map(([event]) => event.name)).toEqual(['token', 'done']);
    expect(onEvent.mock.calls[0][0].data.text).toBe('Привет');
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Idempotency-Key')).toBe(
      'retry-key',
    );
  });

  it('rejects responses with no stream or completion marker', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
    await expect(server.stream('/chat', {}, () => {})).rejects.toMatchObject({
      code: 'invalid_stream',
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('event: token\ndata: {"text":"partial"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    await expect(server.stream('/chat', {}, () => {})).rejects.toMatchObject({
      code: 'interrupted_stream',
    });
  });
});

it('enforces the per-intern message limit and preserves the first 20 accepted requests', async () => {
  const chat = await intern.chats.create();
  for (const index of Array.from({ length: 20 }, (_, position) => position)) {
    const response = await mockRequest(
      `/chats/${chat.id}/messages`,
      {
        method: 'POST',
        body: { text: `Вопрос ${index}`, mode: 'guide', attachment_ids: [] },
      },
      'mock:anya',
    );
    expect(response.status).toBe(200);
    await response.body?.cancel();
  }
  await expect(
    intern.chats.send(
      chat.id,
      { text: 'Лишний вопрос', mode: 'guide', attachment_ids: [] },
      'limit',
      () => {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
  expect(
    (await intern.chats.messages(chat.id)).messages.filter((message) => message.role === 'user'),
  ).toHaveLength(20);
});

it('keeps the draft when invalid inputs arrive and preserves status on a locked chat', async () => {
  const draftChat = await intern.chats.create({ task_id: (await intern.tasks.list())[0].id });
  const sent = await ask('Как создать dev-ветку?', draftChat.id);
  const message = (await intern.chats.messages(sent.id)).messages.at(-1)!;
  await intern.dev.updateTask({ task_id: draftChat.task_id!, status: 'done' });
  await expect(
    intern.chats.followUp(message.id, 'direct', () => {}, new AbortController().signal),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    intern.contacts.create({ name: ' ', role: '', team: '', topics: [], note: '' }),
  ).rejects.toMatchObject({ status: 400 });
  expect(await intern.contacts.list('нет такого имени')).toEqual([]);
  await expect(intern.journal.add([{ text: '', source_chat_id: sent.id }])).rejects.toMatchObject({
    status: 400,
  });
  const logs = (await intern.privacy.get()).access_log;
  expect(logs.some((record) => record.decision === 'allow')).toBe(true);
});

it.each([
  ['Как сделать ревью?', /pull request/],
  ['Упал пайплайн', /первую ошибку/],
])('renders a direct answer for %s', async (question, expected) => {
  const { id } = await ask(question, undefined, 'direct');
  expect((await intern.chats.messages(id)).messages.at(-1)?.content).toMatch(expected);
});
