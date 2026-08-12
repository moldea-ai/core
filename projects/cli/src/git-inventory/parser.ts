import type {
  IGitInventoryCandidate,
  IGitInventoryParser,
  IGitInventoryParserFailureReason,
  IGitInventoryParserResult,
  IGitTrackedEntryMode,
  IGitTrackedEntryStage,
  IGitTrackedInventoryCandidate,
  IGitUntrackedInventoryCandidate,
} from './types.js';

const TRACKED_ENTRY_HEADER_PATTERN =
  /^(100644|100755|120000|160000) (?:[0-9a-f]{40}|[0-9a-f]{64}) ([0-3])$/u;

/** Decodes one complete Git path as strict UTF-8 while preserving an initial BOM scalar. */
const decodeGitPath = (pathBytes: Uint8Array): string | null => {
  if (pathBytes.byteLength === 0) {
    return null;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(pathBytes);
  } catch {
    return null;
  }
};

/** Confirms that one decoded path contains only complete Unicode scalar values. */
const hasOnlyUnicodeScalarValues = (path: string): boolean => {
  for (let index = 0; index < path.length; index += 1) {
    const codeUnit = path.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailingCodeUnit = path.charCodeAt(index + 1);

      if (trailingCodeUnit < 0xdc00 || trailingCodeUnit > 0xdfff) {
        return false;
      }

      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
};

/** Concatenates one complete record assembled across arbitrary process chunks. */
const concatenateRecord = (fragments: readonly Uint8Array[], byteLength: number): Uint8Array => {
  const record = new Uint8Array(byteLength);
  let offset = 0;

  for (const fragment of fragments) {
    record.set(fragment, offset);
    offset += fragment.byteLength;
  }

  return record;
};

/** Parses one tracked `ls-files --stage` record without normalizing its path. */
const parseTrackedCandidate = (record: Uint8Array): IGitTrackedInventoryCandidate | null => {
  const separatorIndex = record.indexOf(0x09);

  if (separatorIndex <= 0 || separatorIndex === record.byteLength - 1) {
    return null;
  }

  let header: string;

  try {
    header = new TextDecoder('utf-8', { fatal: true }).decode(record.subarray(0, separatorIndex));
  } catch {
    return null;
  }

  const headerMatch = TRACKED_ENTRY_HEADER_PATTERN.exec(header);
  const path = decodeGitPath(record.subarray(separatorIndex + 1));

  if (headerMatch === null || path === null || !hasOnlyUnicodeScalarValues(path)) {
    return null;
  }

  return Object.freeze({
    kind: 'tracked',
    mode: headerMatch[1] as IGitTrackedEntryMode,
    path,
    stage: Number(headerMatch[2]) as IGitTrackedEntryStage,
  });
};

/** Parses one untracked `ls-files --others` record without normalizing its path. */
const parseUntrackedCandidate = (record: Uint8Array): IGitUntrackedInventoryCandidate | null => {
  const path = decodeGitPath(record);

  if (path === null || !hasOnlyUnicodeScalarValues(path)) {
    return null;
  }

  return Object.freeze({ kind: 'untracked', path });
};

/** Creates a strict incremental parser for one NUL-delimited Git record grammar. */
const createGitInventoryParser = <TCandidate extends IGitInventoryCandidate>(
  maxEntries: number,
  parseCandidate: (record: Uint8Array) => TCandidate | null,
): IGitInventoryParser<TCandidate> => {
  const candidates: TCandidate[] = [];
  let failureReason: IGitInventoryParserFailureReason | null = null;
  let pendingByteLength = 0;
  let pendingFragments: Uint8Array[] = [];

  const consumeRecord = (): void => {
    if (failureReason !== null) {
      return;
    }

    if (candidates.length >= maxEntries) {
      failureReason = 'entry-limit-exceeded';
      pendingByteLength = 0;
      pendingFragments = [];
      return;
    }

    const candidate = parseCandidate(concatenateRecord(pendingFragments, pendingByteLength));

    pendingByteLength = 0;
    pendingFragments = [];

    if (candidate === null) {
      failureReason = 'invalid';
      return;
    }

    candidates.push(candidate);
  };

  return {
    consume: (chunk): void => {
      if (failureReason !== null) {
        return;
      }

      let fragmentStart = 0;

      for (let index = 0; index < chunk.byteLength; index += 1) {
        if (chunk[index] !== 0x00) {
          continue;
        }

        const fragment = chunk.subarray(fragmentStart, index);

        pendingFragments.push(fragment);
        pendingByteLength += fragment.byteLength;
        consumeRecord();

        if (failureReason !== null) {
          return;
        }

        fragmentStart = index + 1;
      }

      const trailingFragment = chunk.subarray(fragmentStart);

      if (trailingFragment.byteLength > 0) {
        pendingFragments.push(trailingFragment);
        pendingByteLength += trailingFragment.byteLength;
      }
    },
    finish: (): IGitInventoryParserResult<TCandidate> => {
      if (failureReason === null && pendingByteLength > 0) {
        failureReason = 'invalid';
      }

      if (failureReason !== null) {
        return Object.freeze({ kind: 'failed', reason: failureReason });
      }

      return Object.freeze({ candidates: Object.freeze([...candidates]), kind: 'completed' });
    },
  };
};

/** Creates a strict incremental parser for tracked Git inventory output. */
export const createTrackedGitInventoryParser = (
  maxEntries: number,
): IGitInventoryParser<IGitTrackedInventoryCandidate> =>
  createGitInventoryParser(maxEntries, parseTrackedCandidate);

/** Creates a strict incremental parser for untracked Git inventory output. */
export const createUntrackedGitInventoryParser = (
  maxEntries: number,
): IGitInventoryParser<IGitUntrackedInventoryCandidate> =>
  createGitInventoryParser(maxEntries, parseUntrackedCandidate);
