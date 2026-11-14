import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStream } from '@/features/assistant/useAssistant';
import { App } from '@/app/App';
import { useSession } from '@/entities/session/store';
import { useNavigation, type Route } from '@/shared/ui/navigation';
import { ask, dima, intern, mentor, resetDemo } from './helpers';

configure({ asyncUtilTimeout: 4000 });

const cache = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { gcTime: 0 } },
});
const button = (name: string | RegExp) => screen.findByRole('button', { name });
const heading = (name: string | RegExp) => screen.findByRole('heading', { name });
const click = async (name: string | RegExp) => {
  await button(name);
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name }));
};
const field = (name: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
const go = (route: Route) => act(() => useNavigation.getState().go(route));

beforeEach(() => {
  resetDemo();
  useSession.getState().changeBackend('mock');
  useNavigation.getState().go({ page: 'home' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  render(
    <QueryClientProvider client={cache}>
      <App />
    </QueryClientProvider>,
  );
}
async function login(name: RegExp = /Аня Соколова/) {
  mount();
  await click(name);
  const role = await waitFor(() => {
    const user = useSession.getState().user;
    expect(user).toBeTruthy();
    return user!.role;
  });
  if (role === 'intern') {
    const acknowledgement = await screen.findByRole('button', { name: 'Понятно' });
    fireEvent.click(acknowledgement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await heading('С чего начнём?');
  } else {
    await heading('Мои стажёры');
  }
}
async function submitQuestion(text: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Ваш вопрос' }), {
    target: { value: text },
  });
  await click('Отправить вопрос');
  return screen.findAllByRole('button', { name: 'Помогло' });
}

it('streams assistant answers, saves a contact, records feedback and runs the direct answer flow', async () => {
  await login();
  await click('Кто отвечает за сервис платежей?');
  await click('Сохранить в знакомства');
  await button('В знакомствах');
  await click('Не помогло');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Не помогло' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  await click('Написать');
  await button('Скопировано');
  await click('Новый чат');
  await submitQuestion('Как создать dev-ветку?');
  await waitFor(() => expect(useStream.getState().pending).toBe(false));
  const answerActions = screen
    .getByRole('button', { name: 'Помогло' })
    .closest<HTMLElement>('.actions')!;
  fireEvent.click(within(answerActions).getByRole('button', { name: 'Сразу ответ' }));
  await screen.findByText(/git checkout dev/);
  await click('Знакомства');
  await heading('Игорь Л.');
});

it('validates attachments and sends the accepted file with the selected reply mode', async () => {
  await login();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  await click('Прикрепить изображение или лог');
  fireEvent.change(input, { target: { files: [new File(['demo'], 'run.exe')] } });
  await screen.findByRole('alert');
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.log')] },
  });
  await screen.findByText(/5 МБ/);
  const file = new File(['demo log'], 'run.log');
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('run.log');
  await click('Убрать');
  fireEvent.change(input, { target: { files: [file] } });
  await click('Сразу ответ');
  const composer = screen.getByRole('textbox', { name: 'Ваш вопрос' });
  fireEvent.change(composer, { target: { value: 'Где лежит код?' } });
  fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
  expect(useNavigation.getState().route.page).toBe('home');
  fireEvent.keyDown(composer, { key: 'Enter' });
  await button('Помогло');
  const route = useNavigation.getState().route;
  if (route.page !== 'chat') throw new Error('Chat did not open');
  const { messages } = await intern.chats.messages(route.id);
  expect(messages[0].attachments?.[0].filename).toBe('run.log');
  expect(messages[1].mode).toBe('direct');
});

it('creates, edits, searches and removes a manual contact', async () => {
  await login();
  await click('Знакомства');
  await click('Добавить');
  field('Имя', 'Вера QA');
  field('Роль', 'QA');
  field('Команда', 'Payments');
  field('Темы через запятую', 'Тесты, CI');
  field('Заметка', 'Написать утром');
  await click('Сохранить');
  await heading('Вера QA');
  field(/Поиск по имени/, 'Вера');
  await heading('Вера QA');
  await click('Изменить');
  field('Заметка', 'Уточнить тестовый стенд');
  field('Как обратиться', 'Привет, Вера!');
  await click('Сохранить');
  await screen.findByText('Уточнить тестовый стенд');
  await click('Удалить');
  await heading('Ничего не найдено');
});

it('shows mentor role restrictions and creates a task visible to Dima', async () => {
  await intern.privacy.set(true);
  await intern.journal
    .add([{ text: 'Общая запись' }])
    .then((result) => intern.journal.edit(result.entries[0].id, { shared_with_mentor: true }));
  await login(/Борис Н\./);
  await heading('Мои стажёры');
  await screen.findByText('Тема: Платёжный модуль');
  await screen.findByText(/Общая запись/);
  await click('Проверить ограничение доступа к чатам');
  await screen.findByText('403 · Чаты доступны только стажёру.');
  fireEvent.click((await screen.findAllByRole('button', { name: 'Создать задачу' })).at(-1)!);
  field('Название', 'Задача от наставника');
  field('Описание', 'Проверка');
  field('Срок', '2026-12-01');
  await click('Создать');
  await screen.findByText(/Задача от наставника/);
  expect((await dima.tasks.list())[0].title).toBe('Задача от наставника');
  await click(/Борис Н\./);
  await click('Сменить пользователя');
  await click(/Дима Орлов/);
  await click('Понятно');
  await screen.findByText('Сегодня вы в отгуле');
});

it('switches request modes, confirms logout, and preserves data in the selected mode', async () => {
  mount();
  await button(/Аня Соколова/);
  fireEvent.change(screen.getByLabelText('Режим API'), { target: { value: 'server' } });
  await click(/Аня Соколова/);
  await click('Понятно');
  await heading('С чего начнём?');
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/auth/login')).toBe(true);
  await click(/Аня Соколова/);
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.change(screen.getByLabelText('Режим API'), { target: { value: 'mock' } });
  expect(useSession.getState().backend).toBe('server');
  fireEvent.change(screen.getByLabelText('Режим API'), { target: { value: 'mock' } });
  await button(/Аня Соколова/);
  expect(useSession.getState().token).toBeNull();
});

it('operates the diagnostics panel and retries the simulated assistant failure', async () => {
  await ask('Доступ к Jira');
  const [action] = await intern.actions.list('access_request');
  await intern.actions.confirm(action.id);
  await login();
  await click('Служебная панель');
  await heading('Dev-панель');
  field('Поиск по базе знаний', 'Billing');
  await click('Найти');
  await screen.findByText(/document_id/);
  await click('Метрики Prometheus');
  await screen.findByText(/intern_path_mock_up/);
  field('Название', 'Проверка dev');
  await click('Создать задачу');
  await waitFor(async () => expect((await intern.tasks.list())[0].title).toBe('Проверка dev'));
  const task = (await intern.tasks.list())[0];
  field('ID задачи', task.id);
  field('Статус', 'done');
  field('Сдвинуть срок на дней', '2');
  await click('Обновить задачу');
  await waitFor(async () => expect((await intern.tasks.get(task.id)).locked).toBe(true));
  field('ID заявки', action.id);
  await click('Согласовать');
  await waitFor(async () =>
    expect((await intern.actions.get(action.id)).external_status).toBe('granted'),
  );
  await click('Применить');
  await waitFor(async () => expect((await intern.auth.me()).intern?.day).toBe(19));
  await click('Синхронизировать задачи');
  await screen.findByText(/"synced"/);
  await click('Отключить ошибку');
  await click('Ошибка следующего ответа');
  await screen.findByText(/"enabled": true/);
  await click('Новый чат');
  const textbox = await screen.findByRole('textbox', { name: 'Ваш вопрос' });
  fireEvent.change(textbox, { target: { value: 'Кто отвечает за сервис платежей?' } });
  await click('Отправить вопрос');
  await click('Повторить');
  await button('Помогло');
  await waitFor(() => expect(useStream.getState().pending).toBe(false));
  go({ page: 'tools' });
  await heading('Dev-панель');
  await click('Сбросить демо');
  await screen.findByText(/"reset": true/);
  expect((await intern.auth.me()).intern?.day).toBe(12);
});

it('renders streamed practice, next steps, policy notices and document conflicts', async () => {
  const practice = await ask('Дай практику Grafana');
  const next = await ask('Что делать дальше?');
  const notice = await ask('Глобальное пространство');
  const conflict = await ask('Как получить доступ к тестовому стенду?');
  await login();
  go({ page: 'chat', id: practice.id });
  await screen.findByText('Практика · Grafana');
  go({ page: 'chat', id: notice.id });
  await screen.findAllByText('Глобальное пространство');
  await screen.findByText('Доступ к глобальному пространству через помощника не оформляется.');
  go({ page: 'chat', id: conflict.id });
  await screen.findByText('В документах расхождение');
  await click('Сообщить владельцу страницы и наставнику');
  await screen.findByText(/Отправлено \(DOC-/);
  go({ page: 'chat', id: next.id });
  await click('Спросить про шаг');
  await waitFor(async () =>
    expect((await intern.chats.messages(next.id)).messages.length).toBeGreaterThan(2),
  );
});

it('displays empty states and disables composition when a tracker task is closed', async () => {
  await login(/Дима Орлов/);
  await screen.findByText('Сегодня вы в отгуле');
  await click('Задачи');
  await screen.findByText('Наставник ещё не создал задачи.');
  await click('Журнал достижений');
  await heading('Журнал пока пуст');
  await click('Знакомства');
  await heading('Знакомств пока нет');
  await click('Уведомления');
  await screen.findByText('Сейчас всё спокойно.');
  await click('Уведомления');
  const task = await mentor.mentor.createTask({
    intern_id: 'dima',
    title: 'Тест',
    description: 'Проверить',
    deadline: '2026-12-01',
  });
  const chat = await dima.chats.create({ task_id: task.id, title: 'Проверка закрытия' });
  await dima.dev.updateTask({ task_id: task.id, status: 'done' });
  go({ page: 'task', id: task.id });
  expect(await button('Новый чат в задаче')).toBeDisabled();
  await click('Проверка закрытия');
  await screen.findByText('Задача закрыта в трекере. Чат доступен для чтения.');
});

it('recovers from a failed API read and retries a failed send on the same conversation', async () => {
  const delegate = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockResolvedValueOnce(new Response('offline', { status: 503 }));
  useSession.getState().changeBackend('server');
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith('/messages') && init?.method === 'POST') {
      vi.mocked(fetch).mockImplementation(delegate);
      return Response.json(
        { error: { code: 'rate_limited', message: 'Попробуйте ещё раз' } },
        { status: 429 },
      );
    }
    return delegate(url, init);
  });
  mount();
  await screen.findByRole('alert');
  await click('Повторить');
  await click(/Аня Соколова/);
  await click('Понятно');
  await heading('С чего начнём?');
  field('Ваш вопрос', 'Где конфиг Billing?');
  await click('Отправить вопрос');
  await screen.findByText('Попробуйте ещё раз');
  await click('Повторить отправку');
  await button('Помогло');
  const sent = vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, init]) => String(url).endsWith('/messages') && init?.method === 'POST',
    );
  expect(sent).toHaveLength(2);
  expect(new Headers(sent[0][1]?.headers).get('Idempotency-Key')).toBe(
    new Headers(sent[1][1]?.headers).get('Idempotency-Key'),
  );
});
