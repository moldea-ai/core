// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { createMoldeaCliProcessSignalSession } from './session.js';
import type { IMoldeaCliProcessSignalSource, IMoldeaCliTerminationSignal } from './types.js';

/** Creates an evented process-signal boundary for lifecycle tests. */
const createSignalSource = (): {
  readonly emit: (signal: IMoldeaCliTerminationSignal) => void;
  readonly removeListener: ReturnType<
    typeof vi.fn<IMoldeaCliProcessSignalSource['removeListener']>
  >;
  readonly source: IMoldeaCliProcessSignalSource;
} => {
  const listeners = new Map<IMoldeaCliTerminationSignal, Set<() => void>>();
  const addListener = vi.fn<IMoldeaCliProcessSignalSource['addListener']>((signal, listener) => {
    const signalListeners = listeners.get(signal) ?? new Set();

    signalListeners.add(listener);
    listeners.set(signal, signalListeners);
  });
  const removeListener = vi.fn<IMoldeaCliProcessSignalSource['removeListener']>(
    (signal, listener) => {
      listeners.get(signal)?.delete(listener);
    },
  );

  return {
    emit: (signal): void => {
      for (const listener of listeners.get(signal) ?? []) {
        listener();
      }
    },
    removeListener,
    source: { addListener, removeListener },
  };
};

describe('createMoldeaCliProcessSignalSession', () => {
  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('aborts once and maps the first %s to exit code %d', (signal, exitCode) => {
    const signalSource = createSignalSource();
    const session = createMoldeaCliProcessSignalSession(signalSource.source);

    signalSource.emit(signal);
    signalSource.emit(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT');

    expect(session.signal.aborted).toBe(true);
    expect(session.hasReceivedSignal).toBe(true);
    expect(session.exitCode).toBe(exitCode);
    expect(Object.isFrozen(session)).toBe(true);

    session.dispose();
  });

  test('ignores termination signals after output completes', () => {
    const signalSource = createSignalSource();
    const session = createMoldeaCliProcessSignalSession(signalSource.source);

    session.completeOutput();
    signalSource.emit('SIGINT');

    expect(session.signal.aborted).toBe(false);
    expect(session.hasReceivedSignal).toBe(false);
    expect(session.exitCode).toBeNull();

    session.dispose();
  });

  test('removes both listeners exactly once when disposed', () => {
    const signalSource = createSignalSource();
    const session = createMoldeaCliProcessSignalSession(signalSource.source);

    session.dispose();
    session.dispose();
    signalSource.emit('SIGTERM');

    expect(signalSource.removeListener).toHaveBeenCalledTimes(2);
    expect(session.signal.aborted).toBe(false);
    expect(session.exitCode).toBeNull();
  });
});
