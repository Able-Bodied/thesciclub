import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

/**
 * Display and input preferences.
 *
 * Hand-built, never an overlay widget (accessiBe, UserWay, EqualWeb): those inject ARIA and
 * rewrite the DOM, often making things worse; the NFB condemned accessiBe in 2021 and the Overlay
 * Fact Sheet is widely signed. What helps is correct semantics, big targets and a few real
 * preferences. There are no Radix primitives; every control here is hand-written.
 *
 * Stored per device in localStorage, not per member: the same member may use a thumb on a phone
 * and a head pointer on a desktop, and it applies before any session exists (events are public).
 */

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  normal: 'Normal',
  large: 'Large',
  larger: 'Larger',
};

/** Light or dark; "system" is the default. Colours are in src/index.css, under "dark". */
export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  system: 'Match my device',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Reduce motion. "system" follows the phone's own setting, as the CSS always
 * has; On and Off overrule it either way.
 */
export const MOTIONS = ['system', 'on', 'off'] as const;
export type Motion = (typeof MOTIONS)[number];

export const MOTION_LABELS: Record<Motion, string> = {
  system: 'Match my device',
  on: 'On',
  off: 'Off',
};

/** Multiplies the root font size, so it compounds with the browser's own setting. */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  normal: 1,
  large: 1.15,
  larger: 1.35,
};

export interface AccessibilityPreferences {
  /** Multiplies the root font size: text only, not a second browser zoom. */
  textSize: TextSize;
  /**
   * Enlarges controls under 44px without scaling text. Separate from `textSize`: a mouth-stick
   * user may read fine but miss small buttons.
   */
  largeTargets: boolean;
  /** Light, dark, or whatever the device is set to. */
  appearance: Appearance;
  /** Darker words and visible edges in light, brighter in dark. */
  highContrast: boolean;
  /** Stops the app's animations and smooth scrolling. */
  reduceMotion: Motion;
  /** Underlines every link drawn as words rather than as a button. */
  underlineLinks: boolean;
  /** Atkinson Hyperlegible for headings too, with wider spacing. */
  readableText: boolean;
}

export const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  textSize: 'normal',
  largeTargets: false,
  appearance: 'system',
  highContrast: false,
  reduceMotion: 'system',
  underlineLinks: false,
  readableText: false,
};

const STORAGE_KEY = 'thesciclub.accessibility';

/** The defaults. Device-following settings say "system" and ask live, never copied. */
export function systemDefaults(): AccessibilityPreferences {
  return DEFAULT_PREFERENCES;
}

/**
 * Read stored preferences, ignoring unrecognised values. Every field is validated: the string is
 * writable (devtools, stale app), and a bad `textSize` would leave a member stuck at a wrong size.
 */
export function parsePreferences(raw: string | null): Partial<AccessibilityPreferences> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const candidate = parsed as Record<string, unknown>;
    const out: Partial<AccessibilityPreferences> = {};
    if (TEXT_SIZES.includes(candidate.textSize as TextSize)) {
      out.textSize = candidate.textSize as TextSize;
    }
    if (typeof candidate.largeTargets === 'boolean') out.largeTargets = candidate.largeTargets;
    if (APPEARANCES.includes(candidate.appearance as Appearance)) {
      out.appearance = candidate.appearance as Appearance;
    }
    if (typeof candidate.highContrast === 'boolean') out.highContrast = candidate.highContrast;
    // An old boolean from before 2026-10-20 is dropped, not guessed at.
    if (MOTIONS.includes(candidate.reduceMotion as Motion)) {
      out.reduceMotion = candidate.reduceMotion as Motion;
    }
    if (typeof candidate.underlineLinks === 'boolean')
      out.underlineLinks = candidate.underlineLinks;
    if (typeof candidate.readableText === 'boolean') out.readableText = candidate.readableText;
    return out;
  } catch {
    return {};
  }
}

interface AccessibilityValue {
  preferences: AccessibilityPreferences;
  setPreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K],
  ) => void;
  reset: () => void;
}

const AccessibilityContext = createContext<AccessibilityValue | null>(null);

/** Push the preferences onto <html> as attributes; the rules live in src/index.css. */
function applyToDocument(preferences: AccessibilityPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.textSize = preferences.textSize;
  root.dataset.largeTargets = preferences.largeTargets ? 'on' : 'off';
  root.dataset.highContrast = preferences.highContrast ? 'on' : 'off';
  root.dataset.reduceMotion = preferences.reduceMotion;
  root.dataset.underlineLinks = preferences.underlineLinks ? 'on' : 'off';
  root.dataset.readableText = preferences.readableText ? 'on' : 'off';
  root.style.setProperty('--text-scale', String(TEXT_SIZE_SCALE[preferences.textSize]));
  // index.html also sets this before first paint, so there is no light flash.
  root.dataset.appearance = preferences.appearance;
  paintBrowserBar(preferences.appearance);
}

/**
 * Whether to skip motion that script drives (smooth scrolling, the count-up),
 * which the CSS kill switch cannot reach. Reads <html>, so it needs no hook.
 */
export function motionReduced(): boolean {
  const choice = document.documentElement.dataset.reduceMotion;
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The browser bar's colour: navy in light, the charcoal page in dark. index.html matches. */
export const BROWSER_BAR = { light: '#102A4C', dark: '#141619' } as const;

function prefersDark(appearance: Appearance): boolean {
  if (appearance !== 'system') return appearance === 'dark';
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function paintBrowserBar(appearance: Appearance): void {
  const light = document.documentElement.dataset.forceLight !== undefined;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      !light && prefersDark(appearance) ? BROWSER_BAR.dark : BROWSER_BAR.light,
    );
}

/**
 * Light, whatever the setting, while the calling screen is up.
 *
 * For /join (the owner, 2026-10-03): dark is for members, and a carrier's reviewer must see the
 * registered light screenshots. Its own attribute, so the member's choice is not overwritten.
 * index.html sets it before first paint on /join.
 */
export function useForceLight(): void {
  const { preferences } = useAccessibility();
  const appearance = preferences.appearance;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.forceLight = '';
    paintBrowserBar(appearance);
    return () => {
      delete root.dataset.forceLight;
      paintBrowserBar(appearance);
    };
  }, [appearance]);
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => {
    // Read synchronously so the first paint is not at the wrong size and then jumps.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode, or storage blocked. Fall through to the system defaults.
    }
    return { ...systemDefaults(), ...parsePreferences(stored) };
  });

  // Repaint the browser bar if the device turns dark while open; CSS handles the page.
  useEffect(() => {
    if (preferences.appearance !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const repaint = () => {
      paintBrowserBar('system');
    };
    query.addEventListener('change', repaint);
    return () => {
      query.removeEventListener('change', repaint);
    };
  }, [preferences.appearance]);

  useEffect(() => {
    applyToDocument(preferences);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage unavailable. The preference still applies for this session.
    }
  }, [preferences]);

  const setPreference = useCallback<AccessibilityValue['setPreference']>((key, value) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setPreferences(systemDefaults());
  }, []);

  return (
    <AccessibilityContext.Provider value={{ preferences, setPreference, reset }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

/** The preferences, and how to change them. Defaults without a provider (tests), no throw. */
export function useAccessibility(): AccessibilityValue {
  const value = useContext(AccessibilityContext);
  if (value) return value;
  return {
    preferences: DEFAULT_PREFERENCES,
    setPreference: () => undefined,
    reset: () => undefined,
  };
}
