import type ts from 'typescript';

import {
  getClosedObjectProperties,
  getDirectCall,
  getStaticString,
  isNullLiteral,
  isStaticLiteralValue,
  isStrictLiteral,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

/** Removes transparent expression wrappers covered by the OpenAI contract. */
export const unwrapOpenAiExpression: (expression: ts.Expression) => ts.Expression =
  unwrapExpression;

/** Resolves a direct call with an optional outer `await` wrapper. */
export const getOpenAiDirectCall: (expression: ts.Expression) => ts.CallExpression | null =
  getDirectCall;

/** Indexes a fully closed object literal with exact static keys. */
export const getOpenAiClosedObjectProperties: (
  objectLiteral: ts.ObjectLiteralExpression,
) => ReadonlyMap<string, ts.Expression> | null = getClosedObjectProperties;

/** Reads an exact static string literal. */
export const getOpenAiStaticString: (
  expression: ts.Expression | null | undefined,
) => string | null = getStaticString;

/** Determines whether an expression is the `null` literal. */
export const isOpenAiNullLiteral: (expression: ts.Expression) => boolean = isNullLiteral;

/** Determines whether an expression is a literal boolean or `null`. */
export const isOpenAiStrictLiteral: (expression: ts.Expression) => boolean = isStrictLiteral;

/** Determines whether a JSON-like expression is fully static. */
export const isOpenAiStaticLiteralValue: (expression: ts.Expression) => boolean =
  isStaticLiteralValue;
