// scripts/render-worker/remotion.config.ts
//
// Remotion webpack override. The compositions live in src/remotion/ (repo
// root area), but @fontsource/montserrat is installed in
// scripts/render-worker/node_modules — the bundler must be told to resolve it
// there rather than from the repo root node_modules (which doesn't have it).

import path from 'node:path';
import { Config } from '@remotion/cli/config';

Config.overrideWebpackConfig((config) => {
  // process.cwd() is the remotionRoot (scripts/render-worker) when invoked
  // via `npx remotion render` from that directory.
  const workerRoot = process.cwd();
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...((config.resolve as { alias?: Record<string, string> }).alias ?? {}),
        '@fontsource/montserrat': path.resolve(
          workerRoot,
          'node_modules/@fontsource/montserrat'
        ),
      },
    },
  };
});
