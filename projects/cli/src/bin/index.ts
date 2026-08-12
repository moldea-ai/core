import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runMoldeaCli } from '../cli-execution/index.js';
import { loadMoldeaCliPackageMetadata } from '../package-metadata/index.js';
import { formatMoldeaCliHumanError } from '../presentation/index.js';

const executableDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageManifestPath = path.resolve(executableDirectory, '..', 'package.json');

try {
  const invocationDirectory = process.cwd();
  const packageMetadata = await loadMoldeaCliPackageMetadata(packageManifestPath);
  const executionResult = await runMoldeaCli({
    cliVersion: packageMetadata.version,
    commandLineArguments: process.argv.slice(2),
    invocationDirectory,
  });

  if (executionResult.stdout.length > 0) {
    process.stdout.write(executionResult.stdout);
  }

  if (executionResult.stderr.length > 0) {
    process.stderr.write(executionResult.stderr);
  }

  process.exitCode = executionResult.exitCode;
} catch {
  process.stderr.write(formatMoldeaCliHumanError('INTERNAL_ERROR'));
  process.exitCode = 3;
}
