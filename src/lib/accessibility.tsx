import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Display and input preferences.
 *
 * ---------------------------------------------------------------------------
 * Why this is hand-built and not a library
 * ---------------------------------------------------------------------------
 * The products that market themselves as exactly this — an "accessibility
 * widget" you drop in and get a settings menu — are overlays: accessiBe,
 * UserWay, EqualWeb and the rest. They are not an option here, and the reason
 * is not taste.
 *
 * They work by injecting ARIA and rewriting the DOM at runtime, and they
 * routinely make things worse for the people they claim to help: mislabelled
 * landmarks, hijacked keyboard handling, screen-reader output that fights the
 * real page. The National Federation of the Blind passed a resolution
 * condemning accessiBe in 2021; the Overlay Fact Sheet has been signed by
 * hundreds of accessibility practitioners, a great many of them disabled
 * people; and overlays have featured in ADA suits rather than preventing them.
 *
 * This is a club for people with spinal cord injuries. Shipping the thing that
 * disabled professionals have spent years asking sites not to ship would be a
 * poor look and a worse product.
 *
 * What actually helps is dull and specific: correct semantics (the primitives
 * in src/components/ui/ are Radix, which gets keyboard and focus right),
 * targets big enough to hit, and a small number of real preferences. That is
 * what this file is.
 *
 * ---------------------------------------------------------------------------
 * Stored per device, not per member
 * ---------------------------------------------------------------------------
 * The right setting is a property of the machine and the input method, not of
 * the person: the same member may drive a phone with a thumb and a desktop with
 * a head pointer, and wants different answers on each. localStorage also means
 * the preference applies before any session exists, which matters because
 * events are public and somebody may arrive here without an account.
 *
 * The cost is that a new device starts from the defaults. That is the right
 * trade: a preference that follows you onto a machine you drive differently is
 * a preference in the wrong place.
 */

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  normal: 'Normal',
  large: 'Large',
  larger: 'Larger',
};

/**
 * The multiplier each step applies to the root font size.
 *
 * A multiplier rather than an absolute size, so it compounds with whatever the
 * member's browser is already set to instead of overriding it — somebody
 * running a 20px browser default who picks Large gets 23px, not 18.4px. Taking
 * their browser setting away from them would be a strange thing for this
 * screen in particular to do.
 */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  normal: 1,
  large: 1.15,
  larger: 1.35,
};

export interface AccessibilityPreferences {
  /**
   * Multiplies the root font size, and so every `rem` in the type scale.
   *
   * Text only: spacing, images and the shell keep their pixel dimensions, so
   * this is not a second copy of the browser's zoom. Controls still grow,
   * because their heights are `min-h` around text that got bigger.
   */
  textSize: TextSize;
  /**
   * Enlarges controls that are smaller than the 44px target-size guideline
   * without scaling text. Separate from `textSize` on purpose: somebody who
   * reads fine but cannot hit a 28px button with a mouth stick wants this one
   * and not the other.
   */
  largeTargets: boolean;
}

export const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  textSize: 'normal',
  largeTargets: false,
};

const STORAGE_KEY = 'thesciclub.accessibility';

/**
 * What the operating system already says, for a device with nothing stored.
 *
 * Nothing yet. Reduced motion used to be seeded here and offered as a toggle,
 * and it was removed: measured across the whole app it governed six loading
 * spinners and two progress bars, none of them on a surface anybody spends time
 * on — and stopping a spinner makes it read as a hang rather than as a load.
 * A settings row that changes almost nothing is the failure docs/CONTEXT.md
 * describes for screens, in miniature.
 *
 * The `prefers-reduced-motion` media query is still honoured in src/index.css,
 * with no UI attached, so anything animated later respects it for free.
 */
export function systemDefaults(): AccessibilityPreferences {
  return DEFAULT_PREFERENCES;
}

/**
 * Read stored preferences, ignoring anything that is not a value we recognise.
 *
 * Exported so the parsing can be tested directly. Every field is validated
 * rather than trusted: this string is user-writable (devtools, a synced profile,
 * a stale version of the app), and a bad `textSize` would otherwise reach the
 * DOM as an attribute selector that matches nothing, leaving somebody stuck at
 * a size they did not choose with no way to see why.
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

/**
 * Push the preferences onto the root element, where CSS can see them.
 *
 * Attributes rather than inline styles, so the rules live in src/index.css with
 * the rest of the design system and a reader can find them.
 */
function applyToDocument(preferences: AccessibilityPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.textSize = preferences.textSize;
  root.dataset.largeTargets = preferences.largeTargets ? 'on' : 'off';
  root.style.setProperty('--text-scale', String(TEXT_SIZE_SCALE[preferences.textSize]));
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => {
    // Read synchronously on first render so the interface does not paint at the
    // wrong size and then jump — a flash of the wrong layout is disorienting
    // for exactly the people most likely to have changed these.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode, or storage blocked. Fall through to the system defaults.
    }
    return { ...systemDefaults(), ...parsePreferences(stored) };
  });

  useEffect(() => {
    applyToDocument(preferences);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage unavailable. The preference still applies for this session,
      // which is better than refusing to change it at all.
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

/**
 * The preferences, and how to change them.
 *
 * Returns the defaults rather than throwing when there is no provider, so a
 * component rendered in isolation — a test, a story — does not have to be
 * wrapped just to read a value it may not use.
 */
export function useAccessibility(): AccessibilityValue {
  const value = useContext(AccessibilityContext);
  if (value) return value;
  return {
    preferences: DEFAULT_PREFERENCES,
    setPreference: () => undefined,
    reset: () => undefined,
  };
}
