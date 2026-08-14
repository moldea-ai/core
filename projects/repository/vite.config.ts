import { createLibraryConfig } from '../../configs/vite/library.config.js';

export default createLibraryConfig({
  entry: {
    index: 'src/index.ts',
    memory: 'src/memory.ts',
  },
  externalPackages: ['error-message-utils'],
  platform: 'environment-neutral',
  rootDirectory: import.meta.dirname,
});
