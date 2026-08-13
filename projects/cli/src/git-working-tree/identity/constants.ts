// fixed Git queries used to establish one working-tree identity
export const GIT_WORKING_TREE_IDENTITY_ARGUMENTS = Object.freeze({
  CommonDirectory: Object.freeze(['rev-parse', '--git-common-dir']),
  GitDirectory: Object.freeze(['rev-parse', '--absolute-git-dir']),
  RepositoryRoot: Object.freeze(['rev-parse', '--show-toplevel']),
});
