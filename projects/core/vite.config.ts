import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    adapter: 'src/adapter.ts',
    format: 'src/format.ts',
    index: 'src/index.ts',
  },
  externalPackages: ['@moldea.ai/repository', 'error-message-utils'],
  platform: 'environment-neutral',
  rootDirectory: import.meta.dirname,
});
