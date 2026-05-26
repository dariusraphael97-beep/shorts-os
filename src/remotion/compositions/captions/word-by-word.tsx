// src/remotion/compositions/captions/word-by-word.tsx
//
// Word-by-word kinetic-typography caption composition for Phase 2.5.
//
// Design (per operator's 6-item checklist):
//   1. Montserrat ExtraBold (weight 800), 80px base * font_scale
//   2. Words enter one at a time with a spring-bounce animation
//   3. Each word appears at its Whisper-aligned startFrame (~50ms accuracy)
//   4. Accent words tint accent_color (default #FFD23F) and scale 1.0 → 1.15 briefly
//   5. White fill + 4px black stroke + drop shadow → readable on any b-roll
//   6. Bottom-third positioning (vertical offset from top ~ 63% of 1920px)

import React from 'react';
import { AbsoluteFill, Composition, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionsProps } from './props';
import { loadCaptionFont } from '../../lib/fonts';
import { wordsToFrames, isFirstNoun, type FramedWord } from '../../lib/timing';

const BASE_FONT_SIZE_PX = 80;
const STROKE_WIDTH_PX = 4;
const ENTER_DURATION_FRAMES = 6;        // ~200ms at 30fps
const EMPHASIS_PULSE_FRAMES = 12;       // ~400ms at 30fps
const WORDS_PER_CUE = 3;                // up to 3 words visible at once

interface WordBoxProps {
  word: FramedWord;
  accentColor: string;
  isAccent: boolean;
  fontScale: number;
}

const WordBox: React.FC<WordBoxProps> = ({ word, accentColor, isAccent, fontScale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - word.startFrame;

  if (localFrame < 0) return null;
  if (frame > word.endFrame + EMPHASIS_PULSE_FRAMES + ENTER_DURATION_FRAMES) return null;

  // Bounce on entry (spring config: tight bounce, settles in ~200ms)
  const enterScale = spring({
    frame: localFrame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.4 },
    durationInFrames: ENTER_DURATION_FRAMES,
  });

  // Accent pulse — scale 1.0 → 1.15 → 1.0 over EMPHASIS_PULSE_FRAMES
  let accentScale = 1;
  if (isAccent) {
    const halfP = EMPHASIS_PULSE_FRAMES / 2;
    if (localFrame < halfP) accentScale = 1 + (0.15 * localFrame / halfP);
    else if (localFrame < EMPHASIS_PULSE_FRAMES) accentScale = 1.15 - (0.15 * (localFrame - halfP) / halfP);
  }

  const scale = enterScale * accentScale;
  const color = isAccent ? accentColor : '#FFFFFF';

  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 12px',
        transform: `scale(${scale})`,
        color,
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: BASE_FONT_SIZE_PX * fontScale,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        WebkitTextStroke: `${STROKE_WIDTH_PX}px #000000`,
        textShadow:
          '0px 4px 12px rgba(0,0,0,0.65), 0px 0px 2px rgba(0,0,0,0.9)',
        // Force the stroke to render BEHIND the fill (Webkit-specific)
        paintOrder: 'stroke fill',
      }}
    >
      {word.word}
    </span>
  );
};

const WordByWord: React.FC<CaptionsProps> = (props) => {
  React.useEffect(() => { void loadCaptionFont(); }, []);

  const { fps } = useVideoConfig();
  const framedWords = React.useMemo(
    () => wordsToFrames(props.words, fps, props.animation_speed),
    [props.words, fps, props.animation_speed],
  );

  // Build cues (rolling windows of up to WORDS_PER_CUE words)
  const cues: FramedWord[][] = React.useMemo(() => {
    const out: FramedWord[][] = [];
    for (let i = 0; i < framedWords.length; i += WORDS_PER_CUE) {
      out.push(framedWords.slice(i, i + WORDS_PER_CUE));
    }
    return out;
  }, [framedWords]);

  const frame = useCurrentFrame();
  // Pick the currently-visible cue (the one whose first word has started but
  // whose last word's endFrame + buffer hasn't passed)
  const activeCue = cues.find(
    (c) => frame >= c[0].startFrame && frame < c[c.length - 1].endFrame + ENTER_DURATION_FRAMES + 4,
  );

  if (!activeCue) return <AbsoluteFill />;

  const allWordStrings = framedWords.map((w) => w.word);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Bottom-third: vertical center of the caption block ~ 73% down the 1920px tall frame
          top: '63%',
          textAlign: 'center',
          padding: '0 60px',
          lineHeight: 1.05,
        }}
      >
        {activeCue.map((w) => {
          let isAccent = false;
          if (props.accent_word_policy === 'highlighted-by-director') {
            isAccent = props.highlighted_words
              .map((s) => s.toLowerCase())
              .includes(w.word.toLowerCase());
          } else if (props.accent_word_policy === 'first-noun') {
            // First emphasizable word in the cue (per isFirstNoun heuristic)
            const firstAccent = activeCue.find(
              (cw) => isFirstNoun(cw.word, framedWords.indexOf(cw), allWordStrings),
            );
            isAccent = firstAccent === w;
          }
          // 'none' policy leaves all isAccent = false

          return (
            <WordBox
              key={`${w.word}-${w.startFrame}`}
              word={w}
              accentColor={props.accent_color}
              isAccent={isAccent}
              fontScale={props.font_scale}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const defaultCaptionsProps: CaptionsProps = {
  variant: 'word-by-word',
  accent_color: '#FFD23F',
  accent_word_policy: 'first-noun',
  highlighted_words: [],
  animation_speed: 1.0,
  font_scale: 1.0,
  words: [],
  durationSeconds: 0,
};

export const WordByWordComposition: React.FC = () => (
  <Composition
    id="captions-word-by-word"
    component={WordByWord}
    durationInFrames={1800}      // 60s at 30fps; overridden per-render via CLI flags
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaultCaptionsProps}
  />
);
