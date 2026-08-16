import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createWebsiteModel, writeWebsiteModel } from '../src/lib/generation/generation.ts';
import { verifyProductionBuild } from './verify-build.ts';

const execFileAsync = promisify(execFile);

await writeWebsiteModel(createWebsiteModel());
await execFileAsync('astro', ['build'], { env: process.env });
verifyProductionBuild();
