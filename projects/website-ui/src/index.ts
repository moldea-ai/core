// configuration exceptions
export { WebsiteUiConfigurationException } from './exceptions.js';
export type { IWebsiteUiConfigurationErrorCode } from './exceptions.js';

// search
export { parseSearchDocuments, searchDocuments } from './search/index.js';
export type { ISearchDocument } from './search/index.js';

// site URLs
export {
  DEFAULT_BASE_PATH,
  createCanonicalUrl,
  isPublicRouteActive,
  normalizeBasePath,
  withBase,
} from './site/index.js';

// theme
export { isDarkTheme, parseThemePreference } from './theme/index.js';
export type { IThemePreference } from './theme/index.js';
