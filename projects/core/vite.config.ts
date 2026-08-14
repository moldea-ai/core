import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    adapter: 'src/adapter/index.ts',
    format: 'src/format/index.ts',
    index: 'src/index.ts',
  },
  externalPackages: ['@moldea.ai/repository', 'error-message-utils', 'yaml'],
  platform: 'environment-neutral',
  rootDirectory: import.meta.dirname,
});
