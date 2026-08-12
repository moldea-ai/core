import type { IFilesystemDirectoryIdentity, IFilesystemRegularFileFingerprint } from './types.js';

interface IFilesystemDirectoryIdentitySource {
  readonly birthtimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
}

interface IFilesystemRegularFileFingerprintSource extends IFilesystemDirectoryIdentitySource {
  readonly ctimeNs: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
}

interface IFilesystemStableIdentity {
  readonly birthtimeNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: bigint;
}

const hasSameFilesystemStableIdentity = (
  firstIdentity: IFilesystemStableIdentity,
  secondIdentity: IFilesystemStableIdentity,
): boolean => {
  return (
    firstIdentity.birthtimeNanoseconds === secondIdentity.birthtimeNanoseconds &&
    firstIdentity.device === secondIdentity.device &&
    firstIdentity.inode === secondIdentity.inode &&
    firstIdentity.mode === secondIdentity.mode
  );
};

/**
 * Captures stable directory identity without change-prone membership timestamps.
 * @param statistics The no-follow directory metadata supplied by Node.js.
 * @returns A frozen identity suitable for alias and replacement detection.
 */
export const createFilesystemDirectoryIdentity = (
  statistics: IFilesystemDirectoryIdentitySource,
): IFilesystemDirectoryIdentity => {
  return Object.freeze({
    birthtimeNanoseconds: statistics.birthtimeNs,
    device: statistics.dev,
    inode: statistics.ino,
    mode: statistics.mode,
  });
};

/**
 * Captures the strongest relevant regular-file metadata exposed by BigIntStats.
 * @param statistics The no-follow regular-file metadata supplied by Node.js.
 * @returns A frozen fingerprint for creation-time and later file verification.
 */
export const createFilesystemRegularFileFingerprint = (
  statistics: IFilesystemRegularFileFingerprintSource,
): IFilesystemRegularFileFingerprint => {
  return Object.freeze({
    birthtimeNanoseconds: statistics.birthtimeNs,
    changeTimeNanoseconds: statistics.ctimeNs,
    device: statistics.dev,
    inode: statistics.ino,
    mode: statistics.mode,
    modificationTimeNanoseconds: statistics.mtimeNs,
    size: statistics.size,
  });
};

/**
 * Compares two directory identities without consulting change-prone directory timestamps.
 * @param firstIdentity The original or left-side directory identity.
 * @param secondIdentity The current or right-side directory identity.
 * @returns Whether both identities represent the same observed directory.
 */
export const hasSameFilesystemDirectoryIdentity = (
  firstIdentity: IFilesystemDirectoryIdentity,
  secondIdentity: IFilesystemDirectoryIdentity,
): boolean => {
  return hasSameFilesystemStableIdentity(firstIdentity, secondIdentity);
};

/**
 * Compares regular-file identity and content-change metadata exactly.
 * @param firstFingerprint The creation-time or left-side fingerprint.
 * @param secondFingerprint The current or right-side fingerprint.
 * @returns Whether both fingerprints represent the same observed file state.
 */
export const hasSameFilesystemRegularFileFingerprint = (
  firstFingerprint: IFilesystemRegularFileFingerprint,
  secondFingerprint: IFilesystemRegularFileFingerprint,
): boolean => {
  return (
    hasSameFilesystemStableIdentity(firstFingerprint, secondFingerprint) &&
    firstFingerprint.changeTimeNanoseconds === secondFingerprint.changeTimeNanoseconds &&
    firstFingerprint.modificationTimeNanoseconds ===
      secondFingerprint.modificationTimeNanoseconds &&
    firstFingerprint.size === secondFingerprint.size
  );
};
