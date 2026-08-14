import { GIT_CONTENT_TRANSFORMATION_ATTRIBUTES } from './constants.js';
import type {
  IGitContentTransformationAttribute,
  IGitContentTransformationAttributeValues,
  IGitContentTransformationParsedAttributes,
  IGitContentTransformationParser,
  IGitContentTransformationParserInput,
  IGitContentTransformationParserResult,
} from './types.js';

interface IMutableAttributeValues {
  filter?: string;
  ident?: string;
  workingTreeEncoding?: string;
}

/** Concatenates one complete NUL-delimited field assembled across process chunks. */
const concatenateField = (fragments: readonly Uint8Array[], byteLength: number): Uint8Array => {
  const field = new Uint8Array(byteLength);
  let offset = 0;

  for (const fragment of fragments) {
    field.set(fragment, offset);
    offset += fragment.byteLength;
  }

  return field;
};

/** Decodes one Git attribute field as strict UTF-8 while preserving an initial BOM scalar. */
const decodeField = (field: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(field);
  } catch {
    return null;
  }
};

/** Resolves one exact supported attribute name without accepting aliases. */
const resolveAttribute = (candidate: string): IGitContentTransformationAttribute | null => {
  return GIT_CONTENT_TRANSFORMATION_ATTRIBUTES.find((attribute) => attribute === candidate) ?? null;
};

/** Stores one exact Git value while rejecting duplicate attribute records. */
const storeAttribute = (
  values: IMutableAttributeValues,
  attribute: IGitContentTransformationAttribute,
  value: string,
): boolean => {
  const property = attribute === 'working-tree-encoding' ? 'workingTreeEncoding' : attribute;

  if (Object.hasOwn(values, property)) {
    return false;
  }

  values[property] = value;
  return true;
};

/** Confirms that all three required effective attribute values were received. */
const hasCompleteValues = (
  values: IMutableAttributeValues,
): values is IGitContentTransformationAttributeValues =>
  Object.hasOwn(values, 'filter') &&
  Object.hasOwn(values, 'ident') &&
  Object.hasOwn(values, 'workingTreeEncoding');

/**
 * Creates a strict parser for NUL-delimited `git check-attr` triples.
 * @param input The exact paths whose three effective attributes must be present.
 * @returns An incremental all-or-nothing parser.
 */
export const createGitContentTransformationParser = (
  input: IGitContentTransformationParserInput,
): IGitContentTransformationParser => {
  const paths = [...input.paths];
  const valuesByPath = new Map<string, IMutableAttributeValues>();
  let fields: Uint8Array[] = [];
  let isFailed = false;
  let pendingByteLength = 0;
  let pendingFragments: Uint8Array[] = [];

  for (const path of paths) {
    if (path.length === 0 || path.includes('\u0000') || valuesByPath.has(path)) {
      isFailed = true;
      continue;
    }

    valuesByPath.set(path, {});
  }

  const consumeRecord = (): void => {
    if (isFailed || fields.length !== 3) {
      return;
    }

    const path = decodeField(fields[0] ?? new Uint8Array());
    const attributeCandidate = decodeField(fields[1] ?? new Uint8Array());
    const value = decodeField(fields[2] ?? new Uint8Array());

    fields = [];

    if (path === null || attributeCandidate === null || value === null) {
      isFailed = true;
      return;
    }

    const attribute = resolveAttribute(attributeCandidate);
    const values = valuesByPath.get(path);

    if (attribute === null || values === undefined || !storeAttribute(values, attribute, value)) {
      isFailed = true;
    }
  };

  const consumeField = (): void => {
    if (isFailed) {
      return;
    }

    fields.push(concatenateField(pendingFragments, pendingByteLength));
    pendingByteLength = 0;
    pendingFragments = [];

    if (fields.length === 3) {
      consumeRecord();
    }
  };

  return {
    consume: (chunk): void => {
      if (isFailed) {
        return;
      }

      let fragmentStart = 0;

      for (let index = 0; index < chunk.byteLength; index += 1) {
        if (chunk[index] !== 0x00) {
          continue;
        }

        const fragment = chunk.subarray(fragmentStart, index);

        pendingFragments.push(Uint8Array.from(fragment));
        pendingByteLength += fragment.byteLength;
        consumeField();

        if (isFailed) {
          return;
        }

        fragmentStart = index + 1;
      }

      const trailingFragment = chunk.subarray(fragmentStart);

      if (trailingFragment.byteLength > 0) {
        pendingFragments.push(Uint8Array.from(trailingFragment));
        pendingByteLength += trailingFragment.byteLength;
      }
    },
    finish: (): IGitContentTransformationParserResult => {
      if (isFailed || pendingByteLength > 0 || fields.length > 0) {
        return Object.freeze({ kind: 'failed' });
      }

      const attributes: IGitContentTransformationParsedAttributes[] = [];

      for (const path of paths) {
        const values = valuesByPath.get(path);

        if (values === undefined || !hasCompleteValues(values)) {
          return Object.freeze({ kind: 'failed' });
        }

        attributes.push(
          Object.freeze({
            filter: values.filter,
            ident: values.ident,
            path,
            workingTreeEncoding: values.workingTreeEncoding,
          }),
        );
      }

      return Object.freeze({ attributes: Object.freeze(attributes), kind: 'completed' });
    },
  };
};
