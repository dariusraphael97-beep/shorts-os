// src/remotion/index.tsx
//
// Remotion root. registerRoot() is the entry the CLI invokes via
// `npx remotion render src/remotion/index.tsx <composition-id> ...`.
// Phase 2.5 ships two compositions: the font-probe (Stage 3a) and
// the word-by-word captions.

import React from 'react';
import { registerRoot } from 'remotion';
import { FontProbeComposition } from './compositions/probe/font-probe';
import { WordByWordComposition } from './compositions/captions/word-by-word';

const Root: React.FC = () => (
  <>
    <FontProbeComposition />
    <WordByWordComposition />
  </>
);

registerRoot(Root);
