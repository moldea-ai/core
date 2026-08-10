import type { ICore, ICoreOptions, ITextDocumentInput } from './contracts.js';
import { freezeRecursively } from './immutable.js';
import { normalizeCoreOptions } from './options.js';
import { calculateContentDigest, normalizeTextDocument } from './text.js';

export const createCore = (options?: ICoreOptions): ICore => {
  const snapshot = normalizeCoreOptions(options);

  return freezeRecursively({
    calculateContentDigest: (input: ITextDocumentInput) =>
      calculateContentDigest(input, snapshot.limits),
    normalizeText: (input: ITextDocumentInput) =>
      normalizeTextDocument(input, snapshot.limits, 'normalize-text'),
  });
};
