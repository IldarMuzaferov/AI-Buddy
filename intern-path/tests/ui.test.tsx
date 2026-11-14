import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { dateLabel, Dialog, ErrorText, QueryState, safeLink } from '@/shared/ui/common';

afterEach(cleanup);

it('keeps keyboard focus inside a dialog, closes on Escape and restores focus', () => {
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  const onClose = vi.fn();
  const view = render(
    <Dialog title="Настройки" onClose={onClose}>
      <button>Последний</button>
    </Dialog>,
  );
  const dialog = screen.getByRole('dialog');
  const first = screen.getByRole('button', { name: 'Закрыть' });
  const last = screen.getByRole('button', { name: 'Последний' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  view.unmount();
  expect(outside).toHaveFocus();
  outside.remove();
});

it('shows pending state and recovers an errored query with retry', () => {
  const refetch = vi.fn();
  const view = render(
    <QueryState query={{ isPending: true, error: null, data: undefined, refetch }}>
      {(data) => <p>{String(data)}</p>}
    </QueryState>,
  );
  expect(screen.getByLabelText('Загрузка')).toHaveAttribute('aria-busy', 'true');
  view.rerender(
    <QueryState
      query={{ isPending: false, error: new Error('Сервер недоступен'), data: undefined, refetch }}
    >
      {(data) => <p>{String(data)}</p>}
    </QueryState>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(refetch).toHaveBeenCalledOnce();
  view.rerender(<ErrorText error={{ detail: 'Unexpected' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось выполнить запрос.');
});

it('allows web source links and handles invalid dates and URLs safely', () => {
  expect(safeLink(undefined)).toBeUndefined();
  expect(safeLink('javascript:alert(1)')).toBeUndefined();
  expect(safeLink('http://[')).toBeUndefined();
  expect(safeLink('https://example.com/wiki')).toBe('https://example.com/wiki');
  expect(dateLabel(null)).toBe('—');
  expect(dateLabel('не дата')).toBe('не дата');
  expect(dateLabel('2026-11-10')).toContain('2026');
});
