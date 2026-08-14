// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  createFilesystemDirectoryIdentity,
  createFilesystemRegularFileFingerprint,
  hasSameFilesystemDirectoryIdentity,
  hasSameFilesystemRegularFileFingerprint,
} from './index.js';

const directoryStatistics = {
  birthtimeNs: 11n,
  ctimeNs: 12n,
  dev: 13n,
  ino: 14n,
  mode: 16_877n,
  mtimeNs: 15n,
};

const regularFileStatistics = {
  ...directoryStatistics,
  ctimeNs: 21n,
  mode: 33_188n,
  mtimeNs: 22n,
  size: 23n,
};

describe('filesystem fingerprints', () => {
  test('captures a frozen directory identity without membership timestamps', () => {
    const identity = createFilesystemDirectoryIdentity(directoryStatistics);

    expect(identity).toStrictEqual({
      birthtimeNanoseconds: 11n,
      device: 13n,
      inode: 14n,
      mode: 16_877n,
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(identity).not.toHaveProperty('changeTimeNanoseconds');
    expect(identity).not.toHaveProperty('modificationTimeNanoseconds');
  });

  test('captures a frozen regular-file identity and content-change fingerprint', () => {
    const fingerprint = createFilesystemRegularFileFingerprint(regularFileStatistics);

    expect(fingerprint).toStrictEqual({
      birthtimeNanoseconds: 11n,
      changeTimeNanoseconds: 21n,
      device: 13n,
      inode: 14n,
      mode: 33_188n,
      modificationTimeNanoseconds: 22n,
      size: 23n,
    });
    expect(Object.isFrozen(fingerprint)).toBe(true);
  });

  test('compares every stable directory identity field', () => {
    const identity = createFilesystemDirectoryIdentity(directoryStatistics);

    expect(hasSameFilesystemDirectoryIdentity(identity, { ...identity })).toBe(true);

    for (const changedIdentity of [
      { ...identity, birthtimeNanoseconds: 101n },
      { ...identity, device: 102n },
      { ...identity, inode: 103n },
      { ...identity, mode: 104n },
    ]) {
      expect(hasSameFilesystemDirectoryIdentity(identity, changedIdentity)).toBe(false);
    }
  });

  test('compares every regular-file fingerprint field', () => {
    const fingerprint = createFilesystemRegularFileFingerprint(regularFileStatistics);

    expect(hasSameFilesystemRegularFileFingerprint(fingerprint, { ...fingerprint })).toBe(true);

    for (const changedFingerprint of [
      { ...fingerprint, birthtimeNanoseconds: 101n },
      { ...fingerprint, changeTimeNanoseconds: 102n },
      { ...fingerprint, device: 103n },
      { ...fingerprint, inode: 104n },
      { ...fingerprint, mode: 105n },
      { ...fingerprint, modificationTimeNanoseconds: 106n },
      { ...fingerprint, size: 107n },
    ]) {
      expect(hasSameFilesystemRegularFileFingerprint(fingerprint, changedFingerprint)).toBe(false);
    }
  });
});
