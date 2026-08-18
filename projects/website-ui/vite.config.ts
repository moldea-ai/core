import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    index: 'src/index.ts',
    search: 'src/search/index.ts',
    site: 'src/site/index.ts',
    theme: 'src/theme/index.ts',
  },
  externalPackages: ['error-message-utils'],
  platform: 'environment-neutral',
  rootDirectory: import.meta.dirname,
});
