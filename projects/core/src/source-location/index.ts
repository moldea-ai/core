import type { ISourcePosition, ISourceRange } from '../diagnostics/index.js';

// scalar-aware normalized source lookup used by parsers and diagnostics
export interface ISourceLocator {
  locateRange(startOffset: number, endOffset: number): ISourceRange;
}

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
 * Creates an efficient UTF-16-offset to Unicode-scalar source locator.
 * @param value The already-normalized valid Unicode scalar text.
 * @returns A locator producing one-based lines and columns with zero-based scalar offsets.
 */
export const createSourceLocator = (value: string): ISourceLocator => {
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

  const locatePosition = (candidateOffset: number): ISourcePosition => {
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
    locateRange: (startOffset: number, endOffset: number): ISourceRange => ({
      end: locatePosition(endOffset),
      start: locatePosition(startOffset),
    }),
  });
};
