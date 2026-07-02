/**
 * Unity & Balance Design System
 * Minimalist Neomorphism — Terra Cotta & Soft Sage
 * Based on DESIGN.md and code.html from "us designs"
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Primary: Terra Cotta
    primary: '#9F402D',
    primaryLight: '#E2725B',
    primaryContainer: '#E2725B',
    primaryFixed: '#FFDAD3',
    primaryFixedDim: '#FFB4A5',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#5A0D02',
    onPrimaryFixed: '#3E0500',
    onPrimaryFixedVariant: '#802918',

    // Secondary: Soft Sage
    secondary: '#4E635A',
    secondaryLight: '#8FA88B',
    secondaryContainer: '#CEE5DA',
    secondaryFixed: '#D1E8DD',
    secondaryFixedDim: '#B5CCC1',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#52675E',
    onSecondaryFixed: '#0B1F18',
    onSecondaryFixedVariant: '#374B43',

    // Tertiary
    tertiary: '#625E57',
    tertiaryContainer: '#97928A',
    tertiaryFixed: '#E8E1D9',
    tertiaryFixedDim: '#CCC6BD',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#2E2B25',
    onTertiaryFixed: '#1E1B16',
    onTertiaryFixedVariant: '#4A4640',

    // Surface / Background
    background: '#F9F9F9',
    surface: '#F9F9F9',
    surfaceDim: '#DADADA',
    surfaceBright: '#F9F9F9',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F3F3F3',
    surfaceContainer: '#EEEEEE',
    surfaceContainerHigh: '#E8E8E8',
    surfaceContainerHighest: '#E2E2E2',
    surfaceVariant: '#E2E2E2',
    onBackground: '#1A1C1C',
    onSurface: '#1A1C1C',
    onSurfaceVariant: '#56423E',

    // Accent / Functional
    expense: '#BA1A1A',
    expenseLight: '#FFDAD6',
    income: '#4E635A',
    incomeLight: '#CEE5DA',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    onError: '#FFFFFF',
    onErrorContainer: '#93000A',

    // Outline
    outline: '#89726D',
    outlineVariant: '#DDC0BA',

    // Legacy compatibility
    text: '#1A1C1C',
    textSecondary: '#56423E',
    backgroundElement: '#EEEEEE',
    backgroundSelected: '#E2E2E2',
    card: '#FFFFFF',
    border: '#DDC0BA',
  },
  dark: {
    // Primary: Terra Cotta
    primary: '#FFB4A5',
    primaryLight: '#E2725B',
    primaryContainer: '#802918',
    primaryFixed: '#FFDAD3',
    primaryFixedDim: '#FFB4A5',
    onPrimary: '#5A0D02',
    onPrimaryContainer: '#FFDAD3',
    onPrimaryFixed: '#3E0500',
    onPrimaryFixedVariant: '#802918',

    // Secondary: Soft Sage
    secondary: '#B5CCC1',
    secondaryLight: '#8FA88B',
    secondaryContainer: '#374B43',
    secondaryFixed: '#D1E8DD',
    secondaryFixedDim: '#B5CCC1',
    onSecondary: '#0B1F18',
    onSecondaryContainer: '#CEE5DA',
    onSecondaryFixed: '#0B1F18',
    onSecondaryFixedVariant: '#374B43',

    // Tertiary
    tertiary: '#CCC6BD',
    tertiaryContainer: '#4A4640',
    tertiaryFixed: '#E8E1D9',
    tertiaryFixedDim: '#CCC6BD',
    onTertiary: '#1E1B16',
    onTertiaryContainer: '#E8E1D9',
    onTertiaryFixed: '#1E1B16',
    onTertiaryFixedVariant: '#4A4640',

    // Surface / Background
    background: '#121212',
    surface: '#1E1E1E',
    surfaceDim: '#121212',
    surfaceBright: '#3A3A3A',
    surfaceContainerLowest: '#0D0D0D',
    surfaceContainerLow: '#1A1A1A',
    surfaceContainer: '#242424',
    surfaceContainerHigh: '#2E2E2E',
    surfaceContainerHighest: '#383838',
    surfaceVariant: '#2E2E2E',
    onBackground: '#E6E1E1',
    onSurface: '#E6E1E1',
    onSurfaceVariant: '#D0C4C0',

    // Accent / Functional
    expense: '#FFB4AB',
    expenseLight: '#93000A',
    income: '#B5CCC1',
    incomeLight: '#374B43',
    error: '#FFB4AB',
    errorContainer: '#93000A',
    onError: '#690005',
    onErrorContainer: '#FFDAD6',

    // Outline
    outline: '#90736E',
    outlineVariant: '#56423E',

    // Legacy compatibility
    text: '#E6E1E1',
    textSecondary: '#D0C4C0',
    backgroundElement: '#242424',
    backgroundSelected: '#2E2E2E',
    card: '#1E1E1E',
    border: '#56423E',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  full: 9999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Neomorphic shadow utilities for Unity & Balance design system
 * 
 * Extruded (raised): Used for cards, buttons in default state
 * Pressed (sunken): Used for inputs, active buttons, pressed state
 */
export const NeomorphicShadows = {
  extruded: Platform.select({
    web: {
      boxShadow: '-6px -6px 12px #FFFFFF, 6px 6px 12px #D1D9E6',
    },
    default: {
      shadowColor: '#D1D9E6',
      shadowOffset: { width: 6, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      // Top-left light shadow via elevation hack
      elevation: 5,
    },
  }),
  pressed: Platform.select({
    web: {
      boxShadow: 'inset -6px -6px 12px #FFFFFF, inset 6px 6px 12px #D1D9E6',
    },
    default: {
      shadowColor: '#D1D9E6',
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 2,
    },
  }),
  pressedSm: Platform.select({
    web: {
      boxShadow: 'inset -3px -3px 6px #FFFFFF, inset 3px 3px 6px #D1D9E6',
    },
    default: {
      shadowColor: '#D1D9E6',
      shadowOffset: { width: -2, height: -2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 1,
    },
  }),
} as const;

export const NeomorphicExtrudedBtn: Record<string, any> = Platform.select({
  web: {
    backgroundImage: 'linear-gradient(145deg, #E2725B, #9F402D)',
    boxShadow: '4px 4px 8px #D1D9E6, -4px -4px 8px #FFFFFF',
  },
  default: {
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
});
