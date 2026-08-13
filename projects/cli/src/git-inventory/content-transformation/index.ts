// types
export type {
  IGitContentTransformationAttribute,
  IGitContentTransformationAttributeValues,
  IGitContentTransformationClassification,
  IGitContentTransformationClassifiedEntry,
  IGitContentTransformationClassifiedTrackedEntry,
  IGitContentTransformationClassifiedUntrackedEntry,
  IGitContentTransformationClassifier,
} from './types.js';

// attribute classification
export {
  classifyGitContentTransformations,
  createGitContentTransformationClassifier,
} from './classifier.js';
