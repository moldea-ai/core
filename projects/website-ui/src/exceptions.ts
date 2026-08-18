import { Exception } from 'error-message-utils';

// stable configuration failure contracts exposed by the package
export type IWebsiteUiConfigurationErrorCode = 'INVALID_BASE_PATH' | 'INVALID_SEARCH_INDEX';

const CONFIGURATION_ERROR_MESSAGES = {
  INVALID_BASE_PATH: 'The website base path contains unsupported URL characters.',
  INVALID_SEARCH_INDEX: 'The documentation search index is invalid.',
} as const satisfies Readonly<Record<IWebsiteUiConfigurationErrorCode, string>>;

/** Represents invalid configuration or generated input at a website UI boundary. */
export class WebsiteUiConfigurationException extends Exception {
  public override readonly code: IWebsiteUiConfigurationErrorCode;

  /** Creates the stable configuration exception for one failed boundary. */
  public constructor(code: IWebsiteUiConfigurationErrorCode) {
    super(CONFIGURATION_ERROR_MESSAGES[code], code);
    this.code = code;
    this.name = 'WebsiteUiConfigurationException';
  }
}
