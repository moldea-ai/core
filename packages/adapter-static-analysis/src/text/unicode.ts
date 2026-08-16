/**
 * Counts Unicode scalar values and rejects unpaired UTF-16 surrogates.
 * @param text The JavaScript string to validate and count.
 * @returns The scalar length or `null` when the string is not scalar-valid.
 */
export const getUnicodeScalarLength = (text: string): number | null => {
  let length = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(index + 1);

      if (index + 1 >= text.length || nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        return null;
      }

      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return null;
    }

    length += 1;
  }

  return length;
};
