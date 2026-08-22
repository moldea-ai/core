import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runMoldeaCli } from '../cli-execution/index.js';
import { loadMoldeaCliPackageMetadata } from '../package-metadata/index.js';
import { createMoldeaCliOwnedError, formatMoldeaCliHumanError } from '../presentation/index.js';
import { createMoldeaCliProcessSignalSession } from '../process-signal/index.js';

const executableDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageManifestPath = path.resolve(executableDirectory, '..', 'package.json');
const signalSession = createMoldeaCliProcessSignalSession();

/**
 * Writes one complete process output string.
 * @param outputStream The destination process stream.
 * @param output The complete output to write.
 * @returns A promise resolving after the stream accepts the output.
 */
const writeProcessOutput = async (
  outputStream: NodeJS.WriteStream,
  output: string,
): Promise<void> => {
  if (output.length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    outputStream.write(output, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

try {
  const invocationDirectory = process.cwd();
  const packageMetadata = await loadMoldeaCliPackageMetadata(packageManifestPath);
  const executionResult = await runMoldeaCli({
    commandLineArguments: process.argv.slice(2),
    invocationDirectory,
    packageMetadata,
    signal: signalSession.signal,
  });

  if (signalSession.hasReceivedSignal) {
    process.exitCode = signalSession.exitCode;
  } else {
    await writeProcessOutput(process.stdout, executionResult.stdout);

    if (!signalSession.hasReceivedSignal) {
      await writeProcessOutput(process.stderr, executionResult.stderr);
    }

    if (!signalSession.hasReceivedSignal) {
      signalSession.completeOutput();
    }

    process.exitCode = signalSession.exitCode ?? executionResult.exitCode;
  }
} catch {
  if (signalSession.hasReceivedSignal) {
    process.exitCode = signalSession.exitCode;
  } else {
    await writeProcessOutput(
      process.stderr,
      formatMoldeaCliHumanError(createMoldeaCliOwnedError('INTERNAL_ERROR')),
    ).catch(() => undefined);
    signalSession.completeOutput();
    process.exitCode = 3;
  }
} finally {
  signalSession.dispose();
}
