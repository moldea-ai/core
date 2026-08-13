import type { ICoreConfigurationErrorCode, ICoreOperationErrorCode } from '@moldea.ai/core';
import type { IRepositorySourceErrorCode } from '@moldea.ai/repository';

// safe messages for common repository-source failures
export const REPOSITORY_SOURCE_ERROR_MESSAGES = Object.freeze({
  ABORTED: 'The repository operation was aborted.',
  ACCESS_DENIED: 'Access to the repository source was denied.',
  ENTRY_NOT_DIRECTORY: 'The requested repository entry is not a directory.',
  ENTRY_NOT_FILE: 'The requested repository entry is not a file.',
  ENTRY_NOT_FOUND: 'The requested repository entry was not found.',
  INVALID_SOURCE_DATA: 'The repository source returned invalid data.',
  RESOURCE_LIMIT_EXCEEDED: 'A repository reading resource limit was exceeded.',
  SNAPSHOT_CHANGED: 'The repository snapshot changed during the operation.',
  SOURCE_UNAVAILABLE: 'The repository source is unavailable.',
} as const satisfies Readonly<Record<IRepositorySourceErrorCode, string>>);

// safe messages for Core configuration failures
export const CORE_CONFIGURATION_ERROR_MESSAGES = Object.freeze({
  DUPLICATE_ADAPTER_ID: 'A runtime adapter ID is registered more than once.',
  INVALID_ADAPTER_DEFINITION: 'A runtime adapter definition is invalid.',
  INVALID_RESOURCE_LIMIT: 'A Core resource limit is invalid.',
  RESERVED_ADAPTER_ID: 'A reserved runtime adapter ID was supplied.',
} as const satisfies Readonly<Record<ICoreConfigurationErrorCode, string>>);

// safe messages for Core operation failures
export const CORE_OPERATION_ERROR_MESSAGES = Object.freeze({
  ABORTED: 'The Core operation was aborted.',
  ADAPTER_EXECUTION_FAILED: 'A runtime adapter failed during inspection.',
  INVALID_ARGUMENT: 'The Core operation received an invalid argument.',
  RESOURCE_LIMIT_EXCEEDED: 'A Core resource limit was exceeded.',
} as const satisfies Readonly<Record<ICoreOperationErrorCode, string>>);
