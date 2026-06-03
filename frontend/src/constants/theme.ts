/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#7F3DFF',
    primaryLight: '#EEE5FF',
    secondary: '#3B3DBF',
    text: '#161719',
    background: '#FFFFFF',
    backgroundElement: '#F2F4F7',
    backgroundSelected: '#E4E7EC',
    textSecondary: '#667085',
    expense: '#FF5C5A',
    income: '#00A699',
    card: '#F8F9FA',
    border: '#E4E7EC',
  },
  dark: {
    primary: '#7F3DFF',
    primaryLight: '#322258',
    secondary: '#5C60FF',
    text: '#F4F5F6',
    background: '#0B0E14',
    backgroundElement: '#1A1D24',
    backgroundSelected: '#292D38',
    textSecondary: '#98A2B3',
    expense: '#FF6C6A',
    income: '#00C4B4',
    card: '#151922',
    border: '#232936',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
