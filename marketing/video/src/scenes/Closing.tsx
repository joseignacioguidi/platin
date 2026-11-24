import React from 'react';
import { AbsoluteFill } from 'remotion';
import { WordReveal, useEnter } from '../components/Text';
import { WinkLogo } from '../components/WinkLogo';
import { Sfx } from '../components/AudioTracks';
import { CONFIG } from '../config';
import { COLORS, FONTS, SAFE, SPRING, VIDEO } from '../theme';
import { Wipe } from '../components/Motion';

const LOGO_HEIGHT = 260;
/** The logo winks once, after the call to action settles. */
const WINK_AT = 58;

/** 26–30 s: white background, centered logo, name, tagline and call to action. */
export const Closing: React.FC<{ from?: string }> = ({ from = COLORS.brand }) => {
  const logo = useEnter(10, SPRING.gentle);
  const name = useEnter(20, SPRING.soft);
  const cta = useEnter(48, SPRING.soft);

  return (
    <AbsoluteFill style={{ background: from }}>
      <Wipe color={COLORS.white} />
      <Sfx name="whoosh" at={0} volume={0.3} />
      {/* The wink, once drawn. */}
      <Sfx name="pop" at={WINK_AT + 6} volume={0.7} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          padding: `${SAFE.top}px ${SAFE.left}px ${SAFE.bottom}px`,
        }}
      >
        <WinkLogo
          height={LOGO_HEIGHT}
          winkAt={WINK_AT}
          style={{
            opacity: logo,
            transform: `scale(${0.85 + logo * 0.15})`,
          }}
        />
        <div
          style={{
            marginTop: 44,
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: 150,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: COLORS.ink,
            opacity: name,
            transform: `translateY(${(1 - name) * 24}px)`,
          }}
        >
          {CONFIG.closing.name}
        </div>
        <div style={{ marginTop: 36, width: VIDEO.width - SAFE.left * 2 }}>
          <WordReveal
            text={CONFIG.closing.tagline}
            delay={30}
            stagger={4}
            fontSize={68}
            weight={500}
            color={COLORS.ink}
            highlight={COLORS.brandStrong}
            align="center"
          />
        </div>
        <div
          style={{
            marginTop: 90,
            height: 112,
            padding: '0 52px',
            borderRadius: 56,
            background: COLORS.ink,
            color: COLORS.white,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: FONTS.sans,
            fontWeight: 600,
            fontSize: 44,
            opacity: cta,
            transform: `translateY(${(1 - cta) * 24}px)`,
          }}
        >
          <span>{CONFIG.closing.cta}</span>
          <span style={{ color: COLORS.brand }}>{CONFIG.url}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
