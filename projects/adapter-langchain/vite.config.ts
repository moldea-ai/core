import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    index: 'src/index.ts',
  },
  externalPackages: ['@moldea.ai/core', '@moldea.ai/repository', 'semver', 'typescript'],
  isSourceMapEnabled: false,
  platform: 'node',
  rootDirectory: import.meta.dirname,
});
