// JSON values supported by the deterministic CLI output contract
export type IJsonPrimitive = boolean | null | number | string;
export type IJsonValue =
  IJsonPrimitive | readonly IJsonValue[] | { readonly [key: string]: IJsonValue };
