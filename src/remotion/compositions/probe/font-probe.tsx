// src/remotion/compositions/probe/font-probe.tsx
//
// One-frame composition for the Stage 3a glyph-hash check. Renders the
// pangram "Sphinx of black quartz, judge my vow" in Montserrat ExtraBold
// 80px white-on-black at 1080x1920. The Sandbox-side hash code crops
// specific glyph rectangles and compares against committed fingerprints.

import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { loadCaptionFont } from '../../lib/fonts';

const TEST_STRING = 'Sphinx of black quartz, judge my vow';

const FontProbe: React.FC = () => {
  React.useEffect(() => { void loadCaptionFont(); }, []);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          fontFamily: 'Montserrat',
          fontWeight: 800,
          fontSize: 80,
          color: '#FFFFFF',
          textAlign: 'center',
          padding: '0 60px',
          lineHeight: 1.1,
        }}
      >
        {TEST_STRING}
      </div>
    </AbsoluteFill>
  );
};

export const FontProbeComposition: React.FC = () => (
  <Composition
    id="font-probe"
    component={FontProbe}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1920}
  />
);
