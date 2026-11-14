import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/entities/session/store';
import { resetDemo } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  vi.resetModules();
});

it('mounts the application at the root and renders the login screen', async () => {
  resetDemo();
  useSession.getState().changeBackend('mock');
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  await import('@/app/main');
  expect(await screen.findByRole('button', { name: /Аня Соколова/ })).toBeEnabled();
});

it('reports a missing application mount point', async () => {
  await expect(import('@/app/main')).rejects.toThrow('Корневой элемент приложения отсутствует.');
});
