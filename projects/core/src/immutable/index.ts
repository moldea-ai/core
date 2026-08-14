/**
 * Recursively freezes a Core-owned value without cloning it.
 * @param value The detached acyclic value whose already-frozen objects are deeply frozen.
 * @returns The same value with every mutable reachable object frozen.
 */
export const freezeRecursively = <Value>(value: Value): Readonly<Value> => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Readonly<Record<PropertyKey, unknown>>)[key];
    freezeRecursively(child);
  }

  return Object.freeze(value);
};

/**
 * Creates a record that cannot collide with prototype-chain properties.
 * @param entries The own string-keyed entries to assign.
 * @returns A mutable null-prototype record for later normalization and freezing.
 */
export const createNullPrototypeRecord = <Value>(
  entries: Iterable<readonly [string, Value]>,
): Record<string, Value> => {
  const record = Object.create(null) as Record<string, Value>;

  for (const [key, value] of entries) {
    record[key] = value;
  }

  return record;
};
