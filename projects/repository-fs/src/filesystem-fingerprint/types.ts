// stable directory identity used for path-chain and traversal verification
export interface IFilesystemDirectoryIdentity {
  readonly birthtimeNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: bigint;
}

// regular-file identity and content-change metadata captured before publication
export interface IFilesystemRegularFileFingerprint {
  readonly birthtimeNanoseconds: bigint;
  readonly changeTimeNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: bigint;
  readonly modificationTimeNanoseconds: bigint;
  readonly size: bigint;
}
