import type {
  IStaticAnalysisSourceLocator,
  IStaticAnalysisSourcePosition,
  IStaticAnalysisTextResult,
} from '../types.js';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const findLineIndex = (lineStarts: readonly number[], offset: number): number => {
  let lower = 0;
  let upper = lineStarts.length - 1;

  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);

    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }

  return lower;
};

/**
 * Creates a TypeScript UTF-16-offset to Unicode-scalar source locator.
 * @param value The normalized valid Unicode-scalar text.
 * @returns The scalar-aware source locator.
 */
export const createSourceLocator = (value: string): IStaticAnalysisSourceLocator => {
  const scalarOffsets = new Uint32Array(value.length + 1);
  const lineStarts = [0];
  let scalarOffset = 0;

  for (let codeUnitOffset = 0; codeUnitOffset < value.length;) {
    const codePoint = value.codePointAt(codeUnitOffset);
    const width = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;

    scalarOffsets[codeUnitOffset] = scalarOffset;

    for (let interiorOffset = 1; interiorOffset < width; interiorOffset += 1) {
      scalarOffsets[codeUnitOffset + interiorOffset] = scalarOffset;
    }

    codeUnitOffset += width;
    scalarOffset += 1;
    scalarOffsets[codeUnitOffset] = scalarOffset;

    if (codePoint === 0x0a) {
      lineStarts.push(codeUnitOffset);
    }
  }

  const locatePosition = (candidateOffset: number): IStaticAnalysisSourcePosition => {
    const codeUnitOffset = Math.max(0, Math.min(value.length, candidateOffset));
    const lineIndex = findLineIndex(lineStarts, codeUnitOffset);
    const lineStart = lineStarts[lineIndex] ?? 0;
    const positionScalarOffset = scalarOffsets[codeUnitOffset] ?? 0;
    const lineStartScalarOffset = scalarOffsets[lineStart] ?? 0;

    return {
      column: positionScalarOffset - lineStartScalarOffset + 1,
      line: lineIndex + 1,
      offset: positionScalarOffset,
    };
  };

  return Object.freeze({
    locateRange: (startOffset: number, endOffset: number) => ({
      end: locatePosition(endOffset),
      start: locatePosition(startOffset),
    }),
  });
};

/**
 * Decodes and normalizes source bytes through the runtime-adapter text contract.
 * @param bytes The exact reader-owned source bytes.
 * @returns The normalized text and locator or an invalid-text result.
 */
export const normalizeText = (bytes: Uint8Array): IStaticAnalysisTextResult => {
  let decoded: string;

  try {
    decoded = decoder.decode(bytes);
  } catch {
    return Object.freeze({ valid: false });
  }

  const withoutLeadingBom = decoded.startsWith('\ufeff') ? decoded.slice(1) : decoded;
  const value = withoutLeadingBom.replace(/\r\n?/gu, '\n');

  if (value.includes('\0')) {
    return Object.freeze({ valid: false });
  }

  return Object.freeze({
    locator: createSourceLocator(value),
    valid: true,
    value,
  });
};
