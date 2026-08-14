// Git attributes required to classify working-tree content transformations
export const GIT_CONTENT_TRANSFORMATION_ATTRIBUTES = [
  'filter',
  'working-tree-encoding',
  'ident',
] as const;

// fixed read-only Git command used for NUL-delimited attribute inspection
export const GIT_CONTENT_TRANSFORMATION_ARGUMENTS = [
  'check-attr',
  '--stdin',
  '-z',
  ...GIT_CONTENT_TRANSFORMATION_ATTRIBUTES,
] as const;
