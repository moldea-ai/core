import { createSourceLocator, normalizeText } from '@moldea.ai/adapter-static-analysis';

import type { IOpenAiSourceLocator, IOpenAiTextResult } from '../contracts/index.js';

/**
 * Creates a TypeScript UTF-16-offset to Core Unicode-scalar source locator.
 * @param value The normalized valid Unicode-scalar text.
 * @returns The scalar-aware source locator.
 */
export const createOpenAiSourceLocator = (value: string): IOpenAiSourceLocator =>
  createSourceLocator(value);

/**
 * Decodes and normalizes repository bytes through the adapter text contract.
 * @param bytes The exact reader-owned source bytes.
 * @returns The normalized text and locator or an invalid-text result.
 */
export const normalizeOpenAiText = (bytes: Uint8Array): IOpenAiTextResult => normalizeText(bytes);
