import { RepositorySourceException, type IRepositoryPath } from '@moldea.ai/repository';

/** Identifies a guarded logical file whose working-tree bytes are unsafe to inspect. */
export class GitContentTransformUnsupportedException extends RepositorySourceException {
  /** Creates the CLI-owned marker on the common repository-source failure boundary. */
  public constructor(path: IRepositoryPath) {
    super({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path,
      retryable: false,
    });
    this.name = 'GitContentTransformUnsupportedException';
  }
}
