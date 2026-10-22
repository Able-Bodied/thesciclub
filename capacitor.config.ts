import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The store app: the web build bundled inside it (`pnpm build:native`), never
 * loaded from thesciclub.com. HANDOFF.md says how to build and sync.
 */
const config: CapacitorConfig = {
  appId: 'com.thesciclub.app',
  appName: 'The SCI Club',
  webDir: 'dist-native',
  // Names the app to the sites it calls. Nominatim's policy asks for it, and a
  // WebView's page sends no useful Referer.
  appendUserAgent: 'TheSciClub/1.0 (+https://thesciclub.com)',
  backgroundColor: '#102A4C',
  ios: {
    // The page reads the safe areas itself (env(safe-area-inset-*)).
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Hidden by the app once its first screen is drawn (src/lib/native-shell.ts).
      launchAutoHide: false,
      backgroundColor: '#102A4C',
      showSpinner: false,
    },
    Keyboard: {
      // The web view shrinks above the keyboard, so a focused box stays in sight.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
