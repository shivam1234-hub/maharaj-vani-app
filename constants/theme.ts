/**
 * Shared look of the app. Screens written before this file still carry their
 * own hex values; new and redesigned surfaces read from here so the palette
 * can move in one place.
 */
export const C = {
  bg: '#090c18',
  surface: '#11152a',
  surfaceHi: '#171c36',
  surfaceLo: '#0d1122',
  border: '#1e2546',
  borderHi: '#2b3360',

  text: '#f2f4fb',
  textSub: '#b6bcda',
  textDim: '#7880a8',
  textFaint: '#4c5480',

  success: '#2ECC71',
  danger: '#E5484D',
  youtube: '#FF3B30',
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** `accent + alpha(0.15)` style hex alpha suffix. */
export const alpha = (a: number) =>
  Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
};
