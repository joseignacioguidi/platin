import React from 'react';
import { COLORS, FONTS } from '../theme';

export const TICKET = { width: 560, height: 132 } as const;

/** A purchase as a receipt-like card: name and detail on the left, amount in mono on the right. */
export const Ticket: React.FC<{
  label: string;
  detail: string;
  amount: string;
  color?: string;
  width?: number;
  style?: React.CSSProperties;
}> = ({ label, detail, amount, color = COLORS.expense, width = TICKET.width, style }) => (
  <div
    style={{
      position: 'absolute',
      width,
      height: TICKET.height,
      borderRadius: 28,
      background: color,
      color: COLORS.ink,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 40px 0 44px',
      boxSizing: 'border-box',
      boxShadow: '0 18px 40px rgba(0, 0, 0, 0.25)',
      // Receipt notches on both sides.
      WebkitMaskImage:
        'radial-gradient(circle 14px at 0 50%, transparent 98%, #000 100%), radial-gradient(circle 14px at 100% 50%, transparent 98%, #000 100%)',
      WebkitMaskComposite: 'source-in',
      maskComposite: 'intersect',
      ...style,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 44, lineHeight: 1.1 }}>
        {label}
      </span>
      <span style={{ fontFamily: FONTS.sans, fontWeight: 500, fontSize: 28, opacity: 0.72 }}>
        {detail}
      </span>
    </div>
    <span
      style={{
        fontFamily: FONTS.mono,
        fontWeight: 600,
        fontSize: 42,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {amount}
    </span>
  </div>
);
