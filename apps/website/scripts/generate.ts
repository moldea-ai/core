import { createWebsiteModel, writeWebsiteModel } from '../src/lib/generation/generation.ts';

await writeWebsiteModel(createWebsiteModel());
