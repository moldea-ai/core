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

export const createNullPrototypeRecord = <Value>(
  entries: Iterable<readonly [string, Value]>,
): Record<string, Value> => {
  const record = Object.create(null) as Record<string, Value>;

  for (const [key, value] of entries) {
    record[key] = value;
  }

  return record;
};
