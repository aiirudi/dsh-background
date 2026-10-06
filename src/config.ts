export const REGION_NAMES = [
  "fullscreen",
  "chat",
  "sidebar",
] as const;

export type RegionName = (typeof REGION_NAMES)[number];

/** Visual overrides for the image at the same index in `images`. */
export interface ImageStyle {
  opacity?: number;
  size?: string;
  position?: string;
  blur?: number;
}

export interface RegionConfig {
  enabled: boolean;
  images: string[];
  /** Seconds between images. Zero disables rotation. */
  interval: number;
  random: boolean;
  opacity: number;
  size: string;
  position: string;
  /** Blur radius in pixels. */
  blur: number;
  /** Crossfade duration in seconds. */
  transition: number;
  styles: ImageStyle[];
}

/** Right sidebars share the gallery but lay out images within their own panes. */
export interface RightSidebarLayout {
  size: string;
  position: string;
}

export interface SidebarConfig extends RegionConfig {
  right: RightSidebarLayout;
}

export interface BackgroundConfig {
  enabled: boolean;
  fullscreen: RegionConfig;
  chat: RegionConfig;
  sidebar: SidebarConfig;
}

/** Browser timers cannot represent a larger delay without overflowing. */
export const MAX_INTERVAL_SECONDS = 2_147_483.647;

export class ConfigValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid background configuration:\n${issues.join("\n")}`);
    this.name = "ConfigValidationError";
    this.issues = [...issues];
  }
}

function defaultRegion(): RegionConfig {
  return {
    enabled: true,
    images: [],
    interval: 0,
    random: false,
    opacity: 0.3,
    size: "cover",
    position: "center",
    blur: 0,
    transition: 0.5,
    styles: [],
  };
}

function defaultRightSidebarLayout(): RightSidebarLayout {
  return { size: "auto 100%", position: "center" };
}

export function createDefaultConfig(): BackgroundConfig {
  return {
    enabled: true,
    fullscreen: defaultRegion(),
    chat: defaultRegion(),
    sidebar: { ...defaultRegion(), right: defaultRightSidebarLayout() },
  };
}

const REGION_KEYS = new Set([
  "enabled", "images", "interval", "random", "opacity", "size",
  "position", "blur", "transition", "styles",
]);
const SIDEBAR_KEYS = new Set([...REGION_KEYS, "right"]);
const RIGHT_SIDEBAR_LAYOUT_KEYS = new Set(["size", "position"]);
const IMAGE_STYLE_KEYS = new Set(["opacity", "size", "position", "blur"]);
// Accept the retired field when reading v0.1.0 preferences; the session list
// now shares its sidebar surface, so no independent setting is emitted.
const CONFIG_KEYS = new Set<string>(["enabled", ...REGION_NAMES, "sessionList"]);
const NUMBER_WITH_UNIT = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:px|%|em|rem|vh|vw|vmin|vmax)";
const NONNEGATIVE_LENGTH = new RegExp(`^(?:${NUMBER_WITH_UNIT}|0(?:\\.0+)?)$`);
const POSITION_LENGTH = new RegExp(`^[+-]?(?:${NUMBER_WITH_UNIT}|0(?:\\.0+)?)$`);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function checkKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path ? `${path}.` : ""}${key}: unknown setting`);
  }
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  path: string,
  issues: string[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  issues.push(`${path}: expected a boolean`);
  return fallback;
}

function readNumber(
  value: unknown,
  fallback: number,
  path: string,
  issues: string[],
  max = Number.POSITIVE_INFINITY,
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max) {
    return value;
  }
  const range = Number.isFinite(max) ? `between 0 and ${max}` : "at least 0";
  issues.push(`${path}: expected a finite number ${range}`);
  return fallback;
}

function validSize(value: string): boolean {
  if (value === "cover" || value === "contain") return true;
  const tokens = value.split(/\s+/);
  return tokens.length <= 2 && tokens.every((token) => token === "auto" || NONNEGATIVE_LENGTH.test(token));
}

function validPosition(value: string): boolean {
  const tokens = value.split(/\s+/);
  const horizontal = (token: string) => /^(left|right|center)$/.test(token);
  const vertical = (token: string) => /^(top|bottom|center)$/.test(token);
  const horizontalEdge = (token: string) => token === "left" || token === "right";
  const verticalEdge = (token: string) => token === "top" || token === "bottom";
  const length = (token: string) => POSITION_LENGTH.test(token);
  if (tokens.length === 1) return horizontal(tokens[0]!) || vertical(tokens[0]!) || length(tokens[0]!);
  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string];
    return ((horizontal(first) || length(first)) && (vertical(second) || length(second)))
      || (vertical(first) && horizontal(second));
  }
  if (tokens.length === 3) {
    const [first, second, third] = tokens as [string, string, string];
    return (horizontalEdge(first) && length(second) && vertical(third))
      || (horizontal(first) && verticalEdge(second) && length(third))
      || (verticalEdge(first) && length(second) && horizontal(third))
      || (vertical(first) && horizontalEdge(second) && length(third));
  }
  if (tokens.length === 4) {
    const [first, second, third, fourth] = tokens as [string, string, string, string];
    return length(second) && length(fourth)
      && ((horizontalEdge(first) && verticalEdge(third)) || (verticalEdge(first) && horizontalEdge(third)));
  }
  return false;
}

function readVisualString(
  value: unknown,
  fallback: string,
  path: string,
  issues: string[],
  kind: "size" | "position",
): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (kind === "size" ? validSize(normalized) : validPosition(normalized)) return normalized;
  }
  issues.push(`${path}: expected a valid background ${kind} using keywords, percentages, or CSS lengths`);
  return fallback;
}

function readImage(value: unknown, path: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path}: expected a nonempty image URL`);
    return "";
  }
  const source = value.trim();
  if (/^data:image\/[a-z0-9.+-]+(?:;[^,\r\n]*)?,[\s\S]+$/i.test(source)) return source;
  try {
    const url = new URL(source);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    // Report an actionable error below, including unsupported local file paths.
  }
  issues.push(`${path}: only http://, https://, and data:image URLs are supported; import local files through the settings page`);
  return "";
}

function readImageStyle(value: unknown, path: string, issues: string[]): ImageStyle {
  if (!isRecord(value)) {
    issues.push(`${path}: expected an object with image visual overrides`);
    return {};
  }
  checkKeys(value, IMAGE_STYLE_KEYS, path, issues);
  const result: ImageStyle = {};
  if (value.opacity !== undefined) result.opacity = readNumber(value.opacity, 0.3, `${path}.opacity`, issues, 1);
  if (value.size !== undefined) result.size = readVisualString(value.size, "cover", `${path}.size`, issues, "size");
  if (value.position !== undefined) result.position = readVisualString(value.position, "center", `${path}.position`, issues, "position");
  if (value.blur !== undefined) result.blur = readNumber(value.blur, 0, `${path}.blur`, issues);
  return result;
}

function readRegion(value: unknown, path: RegionName, issues: string[]): RegionConfig {
  const fallback = defaultRegion();
  if (value === undefined) return fallback;
  if (!isRecord(value)) {
    issues.push(`${path}: expected a region configuration object`);
    return fallback;
  }
  checkKeys(value, path === "sidebar" ? SIDEBAR_KEYS : REGION_KEYS, path, issues);
  let images: string[] = [];
  if (value.images !== undefined) {
    if (Array.isArray(value.images)) {
      images = Array.from(value.images, (image, index) => readImage(image, `${path}.images[${index}]`, issues));
    } else issues.push(`${path}.images: expected an array of image URLs`);
  }
  let styles: ImageStyle[] = [];
  if (value.styles !== undefined) {
    if (Array.isArray(value.styles)) {
      styles = Array.from(value.styles, (style, index) => readImageStyle(style, `${path}.styles[${index}]`, issues));
      if (styles.length > images.length) issues.push(`${path}.styles: there are more style overrides than images`);
    } else issues.push(`${path}.styles: expected an array of image visual overrides`);
  }
  return {
    enabled: readBoolean(value.enabled, fallback.enabled, `${path}.enabled`, issues),
    images,
    interval: readNumber(value.interval, fallback.interval, `${path}.interval`, issues, MAX_INTERVAL_SECONDS),
    random: readBoolean(value.random, fallback.random, `${path}.random`, issues),
    opacity: readNumber(value.opacity, fallback.opacity, `${path}.opacity`, issues, 1),
    size: readVisualString(value.size, fallback.size, `${path}.size`, issues, "size"),
    position: readVisualString(value.position, fallback.position, `${path}.position`, issues, "position"),
    blur: readNumber(value.blur, fallback.blur, `${path}.blur`, issues),
    transition: readNumber(value.transition, fallback.transition, `${path}.transition`, issues),
    styles,
  };
}

function readSidebar(value: unknown, issues: string[]): SidebarConfig {
  const region = readRegion(value, "sidebar", issues);
  const fallback = defaultRightSidebarLayout();
  if (!isRecord(value) || value.right === undefined) return { ...region, right: fallback };
  if (!isRecord(value.right)) {
    issues.push("sidebar.right: expected an object with image layout settings");
    return { ...region, right: fallback };
  }
  checkKeys(value.right, RIGHT_SIDEBAR_LAYOUT_KEYS, "sidebar.right", issues);
  return {
    ...region,
    right: {
      size: readVisualString(value.right.size, fallback.size, "sidebar.right.size", issues, "size"),
      position: readVisualString(value.right.position, fallback.position, "sidebar.right.position", issues, "position"),
    },
  };
}

/**
 * Missing fields receive defaults. Invalid values and unknown fields throw a
 * ConfigValidationError with every discovered issue; input is never mutated.
 */
export function normalizeConfig(input: unknown): BackgroundConfig {
  if (input === undefined) return createDefaultConfig();
  if (!isRecord(input)) throw new ConfigValidationError(["configuration: expected an object"]);
  const issues: string[] = [];
  checkKeys(input, CONFIG_KEYS, "", issues);
  const result: BackgroundConfig = {
    enabled: readBoolean(input.enabled, true, "enabled", issues),
    fullscreen: readRegion(input.fullscreen, "fullscreen", issues),
    chat: readRegion(input.chat, "chat", issues),
    sidebar: readSidebar(input.sidebar, issues),
  };
  if (issues.length > 0) throw new ConfigValidationError(issues);
  return result;
}
