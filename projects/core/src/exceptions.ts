import { Exception } from 'error-message-utils';

export type ICoreConfigurationErrorCode =
  | 'DUPLICATE_ADAPTER_ID'
  | 'RESERVED_ADAPTER_ID'
  | 'INVALID_ADAPTER_DEFINITION'
  | 'INVALID_RESOURCE_LIMIT';

export type ICoreOperationErrorCode =
  'INVALID_ARGUMENT' | 'ABORTED' | 'RESOURCE_LIMIT_EXCEEDED' | 'ADAPTER_EXECUTION_FAILED';

export type ICoreOperation =
  | 'create-core'
  | 'normalize-text'
  | 'calculate-content-digest'
  | 'parse-manifest'
  | 'parse-decision'
  | 'inspect-project'
  | 'validate-adapter';

export interface ICoreConfigurationExceptionOptions {
  readonly code: ICoreConfigurationErrorCode;
  readonly operation: ICoreOperation;
  readonly adapterId?: string;
  readonly cause?: unknown;
}

export interface ICoreOperationExceptionOptions {
  readonly code: ICoreOperationErrorCode;
  readonly operation: ICoreOperation;
  readonly retryable: boolean;
  readonly adapterId?: string;
  readonly agentId?: string;
  readonly limit?: string;
  readonly cause?: unknown;
}

const CONFIGURATION_ERROR_MESSAGES = {
  DUPLICATE_ADAPTER_ID: 'A framework adapter ID is registered more than once.',
  INVALID_ADAPTER_DEFINITION: 'A framework adapter definition is invalid.',
  INVALID_RESOURCE_LIMIT: 'A Core resource limit is invalid.',
  RESERVED_ADAPTER_ID: 'A reserved framework adapter ID was supplied.',
} as const satisfies Readonly<Record<ICoreConfigurationErrorCode, string>>;

const OPERATION_ERROR_MESSAGES = {
  ABORTED: 'The Core operation was aborted.',
  ADAPTER_EXECUTION_FAILED: 'A framework adapter failed during inspection.',
  INVALID_ARGUMENT: 'The Core operation received an invalid argument.',
  RESOURCE_LIMIT_EXCEEDED: 'A Core resource limit was exceeded.',
} as const satisfies Readonly<Record<ICoreOperationErrorCode, string>>;

const attachCause = (exception: Error, cause: unknown): void => {
  if (cause === undefined) {
    return;
  }

  Object.defineProperty(exception, 'cause', {
    configurable: true,
    enumerable: false,
    value: cause,
    writable: false,
  });
};

export class CoreConfigurationException extends Exception {
  public override readonly code: ICoreConfigurationErrorCode;

  public readonly operation: ICoreOperation;

  public readonly adapterId: string | null;

  public constructor(options: ICoreConfigurationExceptionOptions) {
    super(CONFIGURATION_ERROR_MESSAGES[options.code], options.code);
    this.code = options.code;
    this.name = 'CoreConfigurationException';
    this.operation = options.operation;
    this.adapterId = options.adapterId ?? null;
    attachCause(this, options.cause);
  }
}

export class CoreOperationException extends Exception {
  public override readonly code: ICoreOperationErrorCode;

  public readonly operation: ICoreOperation;

  public readonly retryable: boolean;

  public readonly adapterId: string | null;

  public readonly agentId: string | null;

  public readonly limit: string | null;

  public constructor(options: ICoreOperationExceptionOptions) {
    super(OPERATION_ERROR_MESSAGES[options.code], options.code);
    this.code = options.code;
    this.name = 'CoreOperationException';
    this.operation = options.operation;
    this.retryable = options.retryable;
    this.adapterId = options.adapterId ?? null;
    this.agentId = options.agentId ?? null;
    this.limit = options.limit ?? null;
    attachCause(this, options.cause);
  }
}
