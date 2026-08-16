import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    index: 'src/index.ts',
  },
  externalPackages: ['semver', 'typescript'],
  platform: 'node',
  rootDirectory: import.meta.dirname,
});
