// src/remotion/index.tsx
//
// Remotion root. registerRoot() is the entry the CLI invokes via
// `npx remotion render src/remotion/index.tsx <composition-id> ...`.
// Phase 2.5 ships two compositions: the font-probe (Stage 3a) and
// the word-by-word captions (Tasks 5-7).

import React from 'react';
import { registerRoot } from 'remotion';
import { FontProbeComposition } from './compositions/probe/font-probe';
// Word-by-word composition is added in Task 5.

const Root: React.FC = () => (
  <>
    <FontProbeComposition />
  </>
);

registerRoot(Root);
