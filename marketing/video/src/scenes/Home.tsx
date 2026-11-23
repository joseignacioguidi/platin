import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CAPTURES, screen } from '../captures';
import { AppScreen, Phone, PHONE_POSITION } from '../components/Phone';
import { EyeIcon, EyeOffIcon } from '../components/Icons';
import { Sfx } from '../components/AudioTracks';
import { Caption } from '../components/Text';
import { CONFIG } from '../config';
import { COLORS, FONTS, SPRING } from '../theme';
import { CARD_END_SCROLL } from './CardSolution';

const HOME = screen('inicio');
const HEADLINE = HOME.headline;
/** Scroll that shows the accounts in pesos and dollars and the goal (CSS px). */
export const HOME_END_SCROLL = HOME.height - CAPTURES.viewport.height;

const formatArs = (n: number): string => Math.round(n).toLocaleString('es-AR');
const headlineValue = (): number => Number((HEADLINE?.text ?? '0').replace(/\D/g, ''));

/** 20–24 s: the home; its headline number counts up, then it scrolls to pesos, dollars and goal. */
export const Home: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cross = spring({ frame, fps, config: SPRING.soft, durationInFrames: 14 });
  const count = spring({ frame: frame - 8, fps, config: SPRING.slow, durationInFrames: 44 });
  const overlay = interpolate(frame, [56, 62], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scrollP = spring({ frame: frame - 66, fps, config: SPRING.slow, durationInFrames: 40 });

  return (
    <AbsoluteFill style={{ background: COLORS.brand }}>
      <Caption text={CONFIG.home.caption} delay={8} duration={duration} highlight={COLORS.ink} />
      <Phone>
        <AppScreen name="tarjeta-cuotas" scroll={CARD_END_SCROLL} />
        <AppScreen name="inicio" scroll={scrollP * HOME_END_SCROLL} opacity={cross}>
          {HEADLINE && overlay > 0 ? (
            <div
              style={{
                position: 'absolute',
                left: HEADLINE.x - 2,
                top: HEADLINE.y - 2,
                width: HEADLINE.width + 8,
                height: HEADLINE.height + 4,
                background: HEADLINE.background,
                color: HEADLINE.color,
                fontFamily: FONTS.mono,
                fontWeight: Number(HEADLINE.fontWeight),
                fontSize: HEADLINE.fontSize,
                letterSpacing: HEADLINE.letterSpacing,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: `${HEADLINE.height + 4}px`,
                paddingLeft: 2,
                whiteSpace: 'pre',
                opacity: overlay,
              }}
            >
              {`$ ${formatArs(headlineValue() * count)}`}
            </div>
          ) : null}
        </AppScreen>
      </Phone>
    </AbsoluteFill>
  );
};

/** 24–26 s: "Ocultar montos" switches on and every amount turns into dots. */
export const HideAmounts: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pillIn = spring({ frame: frame - 2, fps, config: SPRING.soft });
  const press = interpolate(frame, [14, 18, 24], [1, 0.94, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const on = spring({ frame: frame - 17, fps, config: SPRING.soft, durationInFrames: 12 });

  return (
    <AbsoluteFill style={{ background: COLORS.brand }}>
      <Sfx name="click" at={16} />
      <Caption text={CONFIG.hide.caption} delay={20} duration={duration} highlight={COLORS.ink} />
      <Phone>
        <AppScreen name="inicio" scroll={HOME_END_SCROLL} />
        <AppScreen name="inicio-oculto" scroll={HOME_END_SCROLL} opacity={on} />
      </Phone>

      {/* The "ocultar montos" switch, floating over the phone. */}
      <div
        style={{
          position: 'absolute',
          left: 450,
          top: PHONE_POSITION.top + 70,
          height: 104,
          padding: '0 28px 0 32px',
          borderRadius: 52,
          background: COLORS.white,
          color: COLORS.ink,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          boxShadow: '0 20px 50px rgba(24, 24, 24, 0.22)',
          opacity: pillIn,
          transform: `translateY(${(1 - pillIn) * 30}px) scale(${press})`,
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 36,
        }}
      >
        {on > 0.5 ? <EyeOffIcon size={42} /> : <EyeIcon size={42} />}
        <span>{CONFIG.hide.toggle}</span>
        <div
          style={{
            position: 'relative',
            width: 76,
            height: 44,
            borderRadius: 22,
            background: on > 0.5 ? COLORS.brandStrong : COLORS.muted,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 5,
              left: 5 + on * 32,
              width: 34,
              height: 34,
              borderRadius: 17,
              background: COLORS.white,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
