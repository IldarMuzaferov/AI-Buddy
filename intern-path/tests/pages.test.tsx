import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/entities/session/store';
import { useNavigation } from '@/shared/ui/navigation';
import { ask, intern, resetDemo } from './helpers';

let client: QueryClient;

beforeEach(async () => {
  resetDemo();
  useSession.getState().changeBackend('mock');
  await intern.auth.acknowledge();
  const profile = await intern.auth.me();
  useSession.getState().signIn('mock:anya', profile);
  useNavigation.getState().go({ page: 'home' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
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
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(page: 'journal' | 'privacy' | 'tools' | 'actions') {
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  act(() => useNavigation.getState().go({ page }));
}

const click = async (name: string | RegExp) => {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};
const fill = (name: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe('Journal page', () => {
  // it('creates, edits, toggles, drafts, exports and deletes entries', async () => {
  //   mount('journal');
  //   expect(await screen.findByRole('heading', { name: 'Журнал достижений' })).toBeInTheDocument();
  //   await click('Добавить запись');
  //   fill('Что удалось сделать?', 'Покрыл API тестами');
  //   await click('Сохранить');
  //   expect(await screen.findByText('Покрыл API тестами')).toBeInTheDocument();

  //   const entryCard = screen.getByText('Покрыл API тестами').closest('article');
  //   expect(entryCard).not.toBeNull();
  //   const exportToggle = within(entryCard as HTMLElement).getByLabelText(
  //     'Включать в экспорт',
  //   ) as HTMLInputElement;
  //   fireEvent.click(exportToggle);
  //   await waitFor(async () =>
  //     expect((await intern.journal.list()).entries[0]).toMatchObject({
  //       text: 'Покрыл API тестами',
  //       include_in_export: false,
  //     }),
  //   );
  //   fireEvent.click(
  //     within(entryCard as HTMLElement).getByLabelText('Включать в экспорт'),
  //   );
  //   fireEvent.click(
  //     within(entryCard as HTMLElement).getByLabelText('Показывать наставнику'),
  //   );
  //   await waitFor(async () =>
  //     expect((await intern.journal.list()).entries[0].shared_with_mentor).toBe(true),
  //   );

  //   await click('Изменить');
  //   fill('Что удалось сделать?', 'Покрыл API и UI тестами');
  //   await click('Сохранить');
  //   expect(await screen.findByText('Покрыл API и UI тестами')).toBeInTheDocument();

  //   await click('Подготовить PDF');
  //   expect(await screen.findByRole('dialog', { name: 'Экспорт журнала' })).toBeInTheDocument();
  //   fill('Заголовок', 'Мои достижения');
  //   fill('Текст PDF', 'Результат тестирования');
  //   await click('Скачать PDF');
  //   await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  //   await click('Удалить');
  //   await waitFor(async () => expect((await intern.journal.list()).entries).toHaveLength(0));
  // });

  it('collects suggestions from chats and saves selected items', async () => {
    const chat = await ask('Как устроен сервис платежей?');
    await intern.chats.edit(chat.id, { include_in_journal: true });
    mount('journal');
    await click('Собрать из чатов');
    expect(
      await screen.findByRole('dialog', { name: 'Собрать записи из чатов' }),
    ).toBeInTheDocument();
    await click('Предложить записи');
    const textAreas = await screen.findAllByLabelText('Текст записи');
    fireEvent.change(textAreas[0], { target: { value: 'Разобрал сервис платежей' } });
    await click('Сохранить выбранные');
    await waitFor(async () => {
      const saved = await intern.journal.list();
      expect(saved.entries.some((entry) => entry.text === 'Разобрал сервис платежей')).toBe(true);
    });
    expect(await screen.findByText('Разобрал сервис платежей')).toBeInTheDocument();
  });
});

describe('Privacy page', () => {
  it('renders the data matrix, changes sharing and handles both clear confirmation paths', async () => {
    const chat = await intern.chats.create();
    mount('privacy');
    expect(await screen.findByRole('heading', { name: 'Кто что видит' })).toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll('.panel p.muted')).some((node) =>
        node.textContent?.includes('Провайдер ИИ:'),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Показывать тему наставнику'));
    await waitFor(async () =>
      expect((await intern.privacy.get()).settings.share_topics).toBe(true),
    );

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click('Удалить все чаты');
    expect((await intern.chats.list()).history.some((item) => item.id === chat.id)).toBe(true);
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await click('Удалить все чаты');
    expect(await screen.findByRole('status')).toHaveTextContent('Удалено чатов:');
  });
});

describe('Actions page', () => {
  it('filters action types and supports editing, cancellation and reminder generation', async () => {
    await ask('Доступ к Jira');
    mount('actions');
    expect(await screen.findByRole('heading', { name: 'Заявки' })).toBeInTheDocument();
    const actions = await intern.actions.list();
    expect(actions.length).toBeGreaterThan(0);
    fill('Тип заявки', 'access_request');
    await waitFor(() => expect(screen.getByText(/Заявка на доступ/)).toBeInTheDocument());
    const draft = actions.find(
      (action) => action.type === 'access_request' && action.status === 'draft',
    );
    if (draft) {
      await click('Изменить');
      const firstField = document.querySelector(
        'form input:not([type="hidden"]), form textarea, form select',
      ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (firstField) fireEvent.change(firstField, { target: { value: 'Изменённое значение' } });
      await click('Сохранить');
      await click('Подтвердить');
      await click('Подготовить напоминание');
      expect(await screen.findByText(/напоминание/i)).toBeInTheDocument();
      await click(/Скопировать для/);
      await waitFor(async () =>
        expect((await intern.actions.get(draft.id)).status).toBe('confirmed'),
      );
    }
    await ask('Хочу взять отгул');
    const absence = (await intern.actions.list('absence_request')).find(
      (item) => item.status === 'draft',
    );
    if (absence) {
      fill('Тип заявки', 'absence_request');
      await click('Отмена');
      await waitFor(async () =>
        expect((await intern.actions.get(absence.id)).status).toBe('cancelled'),
      );
    }
  });
});

describe('Tools page', () => {
  it('searches knowledge, shows metrics and exercises developer operations', async () => {
    mount('tools');
    expect(await screen.findByRole('heading', { name: 'Служебная панель' })).toBeInTheDocument();
    fill('Поиск по базе знаний', 'Billing');
    await click('Найти');
    expect(await screen.findByText(/document_id/)).toBeInTheDocument();
    await click('Метрики Prometheus');
    expect(await screen.findByText(/intern_path_mock_up/)).toBeInTheDocument();

    fill('Название', 'Тестовая задача');
    await click('Создать задачу');
    await waitFor(async () =>
      expect((await intern.tasks.list()).some((task) => task.title === 'Тестовая задача')).toBe(
        true,
      ),
    );
    const task = (await intern.tasks.list()).find((item) => item.title === 'Тестовая задача')!;
    fill('ID задачи', task.id);
    fill('Статус', 'done');
    fill('Сдвинуть срок на дней', '2');
    await click('Обновить задачу');
    await waitFor(async () => expect((await intern.tasks.get(task.id)).status).toBe('done'));

    await click('Синхронизировать задачи');
    expect(await screen.findByText(/synced/)).toBeInTheDocument();
    await click('Ошибка следующего ответа');
    expect(await screen.findByText(/enabled/)).toBeInTheDocument();
    await click('Отключить ошибку');
    await click('Сбросить демо');
    await waitFor(async () => expect((await intern.auth.me()).intern?.day).toBe(12));
  });
});
