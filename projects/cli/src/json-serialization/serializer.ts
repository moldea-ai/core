/** Compares strings by Unicode code point rather than UTF-16 code unit. */
const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftCodePoints = [...left];
  const rightCodePoints = [...right];
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0);
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0);

    if (leftCodePoint === undefined || rightCodePoint === undefined) {
      throw new TypeError('The JSON object key could not be compared.');
    }

    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
};

/** Serializes one validated JSON value with recursively sorted object keys. */
const serializeJsonValue = (value: unknown, ancestors: Set<object>): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('The JSON number must be finite.');
    }

    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (typeof value !== 'object') {
    throw new TypeError('The value is not supported by the CLI JSON contract.');
  }

  if (ancestors.has(value)) {
    throw new TypeError('The CLI JSON value must not contain a cycle.');
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const serializedEntries: string[] = [];

      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError('The CLI JSON array must not contain empty slots.');
        }

        serializedEntries.push(serializeJsonValue(value[index], ancestors));
      }

      return `[${serializedEntries.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;

    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('The CLI JSON object must be a plain record.');
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('The CLI JSON object must not contain symbol keys.');
    }

    const record = value as Readonly<Record<string, unknown>>;
    const properties = Object.keys(record)
      .sort(compareUnicodeCodePoints)
      .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(record[key], ancestors)}`);

    return `{${properties.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
};

/**
 * Serializes one CLI JSON value with exact recursive Unicode code-point key ordering.
 * @param value The closed JSON value to serialize.
 * @returns Compact deterministic JSON without a trailing line feed.
 * @throws
 * - If the value contains unsupported, non-finite, symbolic, class-backed, or cyclic data
 */
export const serializeJsonDeterministically = (value: unknown): string => {
  return serializeJsonValue(value, new Set());
};
