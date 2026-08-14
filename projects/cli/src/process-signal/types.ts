// process termination signals handled by the executable
export type IMoldeaCliTerminationSignal = 'SIGINT' | 'SIGTERM';

// handled exit codes associated with process termination signals
export type IMoldeaCliSignalExitCode = 130 | 143;

// injectable process-listener boundary used by the signal session
export interface IMoldeaCliProcessSignalSource {
  addListener(signal: IMoldeaCliTerminationSignal, listener: () => void): void;
  removeListener(signal: IMoldeaCliTerminationSignal, listener: () => void): void;
}

// one operation-scoped process-signal lifecycle
export interface IMoldeaCliProcessSignalSession {
  readonly exitCode: IMoldeaCliSignalExitCode | null;
  readonly hasReceivedSignal: boolean;
  readonly signal: AbortSignal;
  completeOutput(): void;
  dispose(): void;
}
