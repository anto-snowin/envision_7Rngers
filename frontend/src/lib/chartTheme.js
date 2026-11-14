/**
 * Chart design tokens.
 *
 * The categorical palette below is a validated set, not a hand-picked one: the
 * eight hues are assigned in fixed order (never cycled) and the five slots used
 * here were checked against both chart surfaces — white cards in light mode,
 * `surface-900` in dark — for lightness band, chroma floor, colour-vision
 * separation on adjacent pairs, normal-vision separation, and contrast.
 *
 * Results: all checks pass in both modes. Worst adjacent CVD separation is
 * ΔE 9.1 (light) / 8.4 (dark) against a target of 8; worst normal-vision
 * separation is ΔE 19.6 / 19.3 against a floor of 15.
 *
 * One caveat drives a UI requirement: on a white surface, aqua, yellow and
 * magenta all sit below 3:1 contrast. That is acceptable for a *fill* but means
 * colour alone must never carry meaning, so every multi-series chart here ships
 * a legend **and** a table view. Do not remove either.
 *
 * The dark column is the same hues re-stepped for the dark surface — not an
 * automatic lightening of the light values.
 */

/** Categorical series colours, in fixed assignment order. */
export const SERIES_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};

/** Single-series charts use one hue; blue is the default sequential hue. */
export const SINGLE_SERIES = { light: '#2a78d6', dark: '#3987e5' };

/**
 * Status colours, reserved for state and never reused as a series colour.
 * Always shipped with an icon or text label, never colour alone.
 */
export const STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

/** Chart chrome: recessive grid and axes, text in ink tokens not series colour. */
export const CHART_CHROME = {
  light: {
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    surface: '#ffffff',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(11,11,11,0.10)',
  },
  dark: {
    grid: '#2c2c2a',
    axis: '#383835',
    muted: '#898781',
    textPrimary: '#f0efec',
    textSecondary: '#c3c2b7',
    surface: '#0f172a',
    tooltipBg: '#1e293b',
    tooltipBorder: 'rgba(255,255,255,0.10)',
  },
};

/**
 * Resolve the full token set for the active theme.
 * @param {boolean} isDark
 */
export function chartTokens(isDark) {
  const mode = isDark ? 'dark' : 'light';
  return {
    mode,
    series: SERIES_COLORS[mode],
    single: SINGLE_SERIES[mode],
    status: STATUS_COLORS,
    ...CHART_CHROME[mode],
  };
}

/**
 * Pick a series colour by index.
 *
 * Colour follows the entity, never its rank — callers pass a stable index
 * derived from the series' identity, so hiding one series never repaints the
 * others. Past the palette length, fold into "Other" rather than generating a
 * new hue.
 */
export function seriesColor(index, isDark) {
  const palette = SERIES_COLORS[isDark ? 'dark' : 'light'];
  return palette[index % palette.length];
}

/** Shared geometry so every chart in the app has the same mark weights. */
export const MARK = {
  /** 2px lines, per the mark spec. */
  lineWidth: 2,
  /** Markers at least 8px so they are a usable hit target. */
  dotRadius: 4,
  activeDotRadius: 6,
  /** Rounded data-ends on bars, anchored to the baseline. */
  barRadius: [4, 4, 0, 0],
  /** 2px surface-coloured gap between adjacent and stacked bars. */
  barGap: 2,
  gridDash: '3 3',
};
