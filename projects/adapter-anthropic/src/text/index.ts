import { createSourceLocator, normalizeText } from '@moldea.ai/adapter-static-analysis';

import type { IAnthropicSourceLocator, IAnthropicTextResult } from '../contracts/index.js';

/**
 * Creates a TypeScript UTF-16-offset to Core Unicode-scalar source locator.
 * @param value The normalized valid Unicode-scalar text.
 * @returns The scalar-aware source locator.
 */
export const createAnthropicSourceLocator = (value: string): IAnthropicSourceLocator =>
  createSourceLocator(value);

/**
 * Decodes and normalizes repository bytes through the adapter text contract.
 * @param bytes The exact reader-owned source bytes.
 * @returns The normalized text and locator or an invalid-text result.
 */
export const normalizeAnthropicText = (bytes: Uint8Array): IAnthropicTextResult =>
  normalizeText(bytes);
