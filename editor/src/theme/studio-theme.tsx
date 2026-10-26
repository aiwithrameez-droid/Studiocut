import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown, Palette } from "lucide-react";

export type StudioThemeId =
  | "dark"
  | "light"
  | "orange"
  | "teal"
  | "yellow"
  | "magenta"
  | "green"
  | "blue";

type ThemeTokens = Record<`--${string}`, string>;

type StudioTheme = {
  id: StudioThemeId;
  label: string;
  swatch: string;
  colorScheme: "dark" | "light";
  tokens: ThemeTokens;
};

const createPastelTheme = (
  id: StudioThemeId,
  label: string,
  swatch: string,
  hue: number,
): StudioTheme => {
  const foreground = `${hue} 24% 14%`;
  const border = `${hue} 20% 66%`;
  const card = `${hue} 42% 99%`;
  const sidebar = `${hue} 30% 94%`;
  const soft = `${hue} 28% 91%`;
  const mutedForeground = `${hue} 12% 39%`;
  // Keep semantic accent text and controls readable on the light surfaces.
  const primary = `${hue} 55% 30%`;
  const primaryForeground = "0 0% 100%";

  return {
    id,
    label,
    swatch,
    colorScheme: "light",
    tokens: {
      "--studio-accent": swatch,
      "--background": `${hue} 35% 97%`,
      "--foreground": foreground,
      "--border": border,
      "--card": card,
      "--card-foreground": foreground,
      "--card-border": border,
      "--sidebar": sidebar,
      "--sidebar-foreground": foreground,
      "--sidebar-border": `${hue} 20% 68%`,
      "--sidebar-primary": primary,
      "--sidebar-primary-foreground": primaryForeground,
      "--sidebar-accent": soft,
      "--sidebar-accent-foreground": foreground,
      "--sidebar-ring": primary,
      "--popover": card,
      "--popover-foreground": foreground,
      "--popover-border": border,
      "--primary": primary,
      "--primary-foreground": primaryForeground,
      "--secondary": soft,
      "--secondary-foreground": foreground,
      "--muted": `${hue} 26% 93%`,
      "--muted-foreground": mutedForeground,
      "--accent": soft,
      "--accent-foreground": foreground,
      "--input": `${hue} 17% 50%`,
      "--ring": primary,
      "--chart-1": primary,
    },
  };
};

const STUDIO_THEMES: StudioTheme[] = [
  {
    id: "dark",
    label: "Dark",
    swatch: "#b4c406",
    colorScheme: "dark",
    tokens: {
      "--studio-accent": "#b4c406",
      "--background": "220 14% 8%",
      "--foreground": "210 16% 92%",
      "--border": "220 11% 20%",
      "--card": "220 14% 10%",
      "--card-foreground": "210 16% 92%",
      "--card-border": "220 11% 20%",
      "--sidebar": "220 14% 9%",
      "--sidebar-foreground": "210 16% 92%",
      "--sidebar-border": "220 11% 19%",
      "--sidebar-primary": "65.0526 94.0594% 39.6078%",
      "--sidebar-primary-foreground": "220 14% 7%",
      "--sidebar-accent": "220 12% 15%",
      "--sidebar-accent-foreground": "210 16% 92%",
      "--sidebar-ring": "65.0526 94.0594% 39.6078%",
      "--popover": "220 14% 11%",
      "--popover-foreground": "210 16% 92%",
      "--popover-border": "220 11% 21%",
      "--primary": "65.0526 94.0594% 39.6078%",
      "--primary-foreground": "220 14% 7%",
      "--secondary": "220 12% 16%",
      "--secondary-foreground": "210 16% 92%",
      "--muted": "220 12% 15%",
      "--muted-foreground": "216 8% 62%",
      "--accent": "220 12% 15%",
      "--accent-foreground": "210 16% 92%",
      "--input": "220 10% 24%",
      "--ring": "65.0526 94.0594% 39.6078%",
      "--chart-1": "65.0526 94.0594% 39.6078%",
    },
  },
  createPastelTheme("light", "Light", "#c8d6e5", 215),
  createPastelTheme("orange", "Orange", "#f4c39e", 29),
  createPastelTheme("teal", "Teal", "#afe1db", 174),
  createPastelTheme("yellow", "Yellow", "#f4e09a", 49),
  createPastelTheme("magenta", "Magenta", "#e6b6d0", 326),
  createPastelTheme("green", "Green", "#bfdcb4", 106),
  createPastelTheme("blue", "Blue", "#b7d0ed", 213),
];

const THEME_STORAGE_KEY = "studiocut-color-theme";
const themeById = new Map(STUDIO_THEMES.map((theme) => [theme.id, theme]));

type ThemeContextValue = {
  theme: StudioThemeId;
  setTheme: (theme: StudioThemeId) => void;
};

const StudioThemeContext = createContext<ThemeContextValue | null>(null);

function readSavedTheme(): StudioThemeId {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && themeById.has(savedTheme as StudioThemeId)) {
      return savedTheme as StudioThemeId;
    }
  } catch {
    // The current session still works when browser storage is unavailable.
  }
  return "dark";
}

export function StudioThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<StudioThemeId>(readSavedTheme);
  const theme = themeById.get(themeId) ?? STUDIO_THEMES[0];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.studioTheme = themeId;
    root.style.colorScheme = theme.colorScheme;
    Object.entries(theme.tokens).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // Keep the selected palette active for this session if saving is blocked.
    }
  }, [theme, themeId]);

  const contextValue = useMemo(
    () => ({ theme: themeId, setTheme: setThemeId }),
    [themeId],
  );
  const themeStyle = {
    ...theme.tokens,
    colorScheme: theme.colorScheme,
  } as unknown as CSSProperties;

  return (
    <StudioThemeContext.Provider value={contextValue}>
      <div
        className="dark h-full"
        data-studio-theme={themeId}
        style={themeStyle}
      >
        {children}
      </div>
    </StudioThemeContext.Provider>
  );
}

export function StudioThemePicker() {
  const context = useContext(StudioThemeContext);
  if (!context) {
    throw new Error("StudioThemePicker must be used inside StudioThemeProvider.");
  }

  const selectedTheme =
    themeById.get(context.theme) ?? STUDIO_THEMES[0];

  return (
    <label className="studio-theme-picker" title="Choose editor theme">
      <Palette aria-hidden="true" />
      <span
        className="studio-theme-swatch"
        aria-hidden="true"
        style={{ backgroundColor: selectedTheme.swatch }}
      />
      <select
        aria-label="Editor theme"
        value={context.theme}
        onChange={(event) =>
          context.setTheme(event.currentTarget.value as StudioThemeId)
        }
      >
        {STUDIO_THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </label>
  );
}
