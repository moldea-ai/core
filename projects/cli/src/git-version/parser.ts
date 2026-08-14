import { TextDecoder } from 'node:util';

import type { IGitVersion } from './types.js';

const GIT_VERSION_PATTERN =
  /^git version (0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:[.-][0-9A-Za-z]+)*(?: \([0-9A-Za-z](?:[0-9A-Za-z ._+/-]*[0-9A-Za-z])?\))?$/;

const UTF8_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

/**
 * Decodes one terminated Git version line as strict UTF-8.
 * @param output The bounded stdout bytes from `git --version`.
 * @returns The line without its terminator, or null when invalid.
 */
const decodeGitVersionLine = (output: Uint8Array): string | null => {
  let decodedOutput: string;

  try {
    decodedOutput = UTF8_DECODER.decode(output);
  } catch {
    return null;
  }

  if (decodedOutput.startsWith('\uFEFF')) {
    return null;
  }

  if (decodedOutput.endsWith('\r\n')) {
    return decodedOutput.slice(0, -2);
  }

  if (decodedOutput.endsWith('\n')) {
    return decodedOutput.slice(0, -1);
  }

  return null;
};

/**
 * Parses a strict `git --version` response without accepting arbitrary prose.
 * @param output The bounded stdout bytes from Git.
 * @returns The frozen numeric version, or null when the output is invalid.
 */
export const parseGitVersionOutput = (output: Uint8Array): IGitVersion | null => {
  const versionLine = decodeGitVersionLine(output);

  if (versionLine === null || versionLine.includes('\r') || versionLine.includes('\n')) {
    return null;
  }

  const match = GIT_VERSION_PATTERN.exec(versionLine);

  if (match === null) {
    return null;
  }

  const majorText = match[1];
  const minorText = match[2];
  const patchText = match[3];

  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return null;
  }

  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);

  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return null;
  }

  return Object.freeze({ major, minor, patch });
};
