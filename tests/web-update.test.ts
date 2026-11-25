/** @jest-environment node */
import { activateUpdate } from '@/features/pwa/web-update';
import { blockUpdates } from '@/features/pwa/update-safety';
import { readWorkerStatus } from '@/features/pwa/worker-status';
import {
  resumeSettingsWrites,
  trackSettingsWrite,
} from '@/database/settings-writes';

jest.mock('@/features/pwa/worker-status', () => ({
  readWorkerStatus: jest.fn(),
}));

const original = new Map(
  ['window', 'document', 'navigator', 'MessageChannel'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);
let worker: ServiceWorker;
let reload: jest.Mock;

beforeEach(() => {
  const workers = Object.assign(new EventTarget(), {
    controller: null as ServiceWorker | null,
  });
  worker = {
    postMessage: jest.fn(() => {
      workers.controller = worker;
      workers.dispatchEvent(new Event('controllerchange'));
    }),
  } as unknown as ServiceWorker;
  reload = jest.fn();
  const storage = new Map<string, string>();
  const values: Record<string, unknown> = {
    document: {
      activeElement: null,
      querySelector: () => ({ content: 'aaaaaaaaaaaaaaaaaaaa' }),
    },
    navigator: { serviceWorker: workers },
    window: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      location: { reload },
    },
    MessageChannel: class {
      port1 = { close: () => {}, onmessage: null };
      port2 = {};
    },
  };
  for (const [name, value] of Object.entries(values))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  jest
    .mocked(readWorkerStatus)
    .mockResolvedValue({ ready: true, version: 'bbbbbbbbbbbbbbbbbbbb' });
});

afterEach(() => {
  resumeSettingsWrites();
  jest.clearAllMocks();
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const settle = () => new Promise<void>((done) => setImmediate(done));

test('не активирует worker, пока открыта хотя бы одна форма', async () => {
  const closeFirst = blockUpdates();
  const closeSecond = blockUpdates();
  closeFirst();
  try {
    await expect(activateUpdate(worker)).rejects.toThrow(/формы/);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  } finally {
    closeSecond();
  }
});

test('активация и единственный reload происходят после commit принятой записи', async () => {
  let commit = () => {};
  let saved = false;
  const writing = trackSettingsWrite(async () => {
    await new Promise<void>((done) => {
      commit = done;
    });
    saved = true;
  });
  const update = activateUpdate(worker);
  await settle();
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  await expect(trackSettingsWrite(async () => {})).rejects.toThrow(
    /обновление/,
  );
  commit();
  await writing;
  await update;
  expect(saved).toBe(true);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('ошибка commit сохраняет текущую версию и разрешает повторное сохранение', async () => {
  let fail = (_error: Error) => {};
  const writing = trackSettingsWrite(
    () =>
      new Promise<void>((_done, reject) => {
        fail = reject;
      }),
  );
  const caughtWrite = writing.catch(() => {});
  const update = activateUpdate(worker);
  const rejected = expect(update).rejects.toThrow(/сохранить/);
  await settle();
  fail(new Error('disk full'));
  await caughtWrite;
  await rejected;
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  await expect(trackSettingsWrite(async () => {})).resolves.toBeUndefined();
});

test('форма, открытая во время ожидания commit, отменяет активацию', async () => {
  let commit = () => {};
  const writing = trackSettingsWrite(
    () =>
      new Promise<void>((done) => {
        commit = done;
      }),
  );
  const update = activateUpdate(worker);
  const rejected = expect(update).rejects.toThrow(/формы/);
  await settle();
  const close = blockUpdates();
  try {
    commit();
    await writing;
    await rejected;
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  } finally {
    close();
  }
});
