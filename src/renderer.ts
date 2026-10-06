import {
  REGION_NAMES,
  normalizeConfig,
  type BackgroundConfig,
  type RegionConfig,
  type RegionName,
} from "./config.js";

export const DEFAULT_SELECTORS: Readonly<Record<RegionName, string>> = {
  fullscreen: '[data-dsh-background-region="fullscreen"], [data-slot="root"] > *',
  chat: '[data-dsh-background-region="chat"], [data-slot="main.conversation"] > *',
  sidebar: '[data-dsh-background-region="sidebar"], [data-slot="sidebar"] > *',
};

export interface BackgroundController {
  update(config: BackgroundConfig): void;
  dispose(): void;
}

interface SavedStyle {
  property: string;
  value: string;
  priority: string;
}

interface MountedHost {
  host: HTMLElement;
  layer: HTMLDivElement;
  planes: [HTMLDivElement, HTMLDivElement];
  activePlane: 0 | 1;
  image: string;
  savedStyles: SavedStyle[];
}

interface RegionRuntime {
  name: RegionName;
  config: RegionConfig;
  imageIndex: number;
  mounts: Map<HTMLElement, MountedHost>;
  timer: number | undefined;
}

let nextOwnerId = 0;

function saveStyle(element: HTMLElement, property: string): SavedStyle {
  return {
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreStyles(element: HTMLElement, saved: SavedStyle[]): void {
  for (const style of saved) {
    if (style.value === "") element.style.removeProperty(style.property);
    else element.style.setProperty(style.property, style.value, style.priority);
  }
}

function imageCssUrl(source: string): string {
  return `url("${source.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, "")}")`;
}

/** Mounts separate image-only layers; content opacity and pointer handling stay intact. */
export function mountBackgrounds(
  document: Document,
  initialConfig: BackgroundConfig,
  selectors: Partial<Record<RegionName, string>> = {},
): BackgroundController {
  const window = document.defaultView;
  if (!window) throw new Error("Backgrounds require a document attached to a browser window");
  let config = normalizeConfig(initialConfig);
  let disposed = false;
  let pendingReconcile = false;
  const ownerId = `dsh-background-${++nextOwnerId}`;
  const resolvedSelectors = { ...DEFAULT_SELECTORS, ...selectors };
  for (const name of REGION_NAMES) {
    const selector = resolvedSelectors[name];
    if (typeof selector !== "string" || selector.trim() === "") {
      throw new Error(`Invalid background selector for ${name}: expected a nonempty CSS selector`);
    }
    try {
      document.querySelectorAll(selector);
    } catch {
      throw new Error(`Invalid background selector for ${name}: ${selector}`);
    }
  }

  const styleElement = document.createElement("style");
  styleElement.setAttribute("data-dsh-background-styles", ownerId);
  styleElement.setAttribute("data-dsh-background-owner", ownerId);
  styleElement.textContent = `
    [data-dsh-background-layer][data-dsh-background-owner="${ownerId}"] {
      position: absolute; inset: 0; z-index: -1; overflow: hidden;
      pointer-events: none !important; user-select: none !important;
      visibility: var(--dsh-background-image-visibility, inherit);
      border-radius: inherit;
    }
    [data-dsh-background-plane][data-dsh-background-owner="${ownerId}"] {
      position: absolute; inset: 0; opacity: 0;
      background-repeat: no-repeat; pointer-events: none !important;
      visibility: var(--dsh-background-image-visibility, inherit);
    }
  `;
  const regions = REGION_NAMES.map((name): RegionRuntime => ({
    name,
    config: config[name],
    imageIndex: initialIndex(config[name]),
    mounts: new Map(),
    timer: undefined,
  }));
  const transparentSurfaces = new Map<HTMLElement, SavedStyle[]>();

  function initialIndex(region: RegionConfig): number {
    return region.random && region.images.length > 1 ? Math.floor(Math.random() * region.images.length) : 0;
  }

  function enabled(region: RegionRuntime): boolean {
    return config.enabled && region.config.enabled && region.config.images.length > 0;
  }

  function owned(node: Node): boolean {
    let element = node.nodeType === 1 ? node as Element : node.parentElement;
    while (element) {
      if (element.getAttribute("data-dsh-background-owner") === ownerId) return true;
      element = element.parentElement;
    }
    return false;
  }

  function stopTimer(region: RegionRuntime): void {
    if (region.timer !== undefined) window!.clearInterval(region.timer);
    region.timer = undefined;
  }

  function applyPlane(plane: HTMLDivElement, region: RegionRuntime): number {
    const base = region.config;
    const override = base.styles[region.imageIndex];
    const blur = override?.blur ?? base.blur;
    plane.style.backgroundImage = imageCssUrl(base.images[region.imageIndex]!);
    plane.style.backgroundSize = override?.size ?? base.size;
    plane.style.backgroundPosition = override?.position ?? base.position;
    plane.style.filter = blur === 0 ? "none" : `blur(${blur}px)`;
    plane.style.inset = blur === 0 ? "0px" : `${-Math.ceil(blur * 2)}px`;
    plane.style.transition = `opacity ${base.transition}s ease`;
    return override?.opacity ?? base.opacity;
  }

  function renderImage(mount: MountedHost, region: RegionRuntime, animate: boolean): void {
    const source = region.config.images[region.imageIndex]!;
    if (!animate || mount.image === source || region.config.transition === 0) {
      const active = mount.planes[mount.activePlane];
      const inactive = mount.planes[mount.activePlane === 0 ? 1 : 0];
      inactive.style.opacity = "0";
      active.style.opacity = String(applyPlane(active, region));
    } else {
      const previous = mount.planes[mount.activePlane];
      const nextPlane = mount.activePlane === 0 ? 1 : 0;
      const next = mount.planes[nextPlane];
      next.style.opacity = "0";
      const opacity = applyPlane(next, region);
      previous.style.transition = `opacity ${region.config.transition}s ease`;
      // Commit the hidden starting state before initiating the crossfade.
      void next.offsetWidth;
      previous.style.opacity = "0";
      next.style.opacity = String(opacity);
      mount.activePlane = nextPlane;
    }
    mount.image = source;
  }

  function ensureTimer(region: RegionRuntime): void {
    const shouldRotate = enabled(region) && region.mounts.size > 0
      && region.config.images.length > 1 && region.config.interval > 0;
    if (!shouldRotate) {
      stopTimer(region);
      return;
    }
    if (region.timer !== undefined) return;
    region.timer = window!.setInterval(() => {
      if (disposed) return;
      const count = region.config.images.length;
      if (region.config.random) {
        // Select another image, so a random rotation always produces a change.
        const offset = 1 + Math.floor(Math.random() * (count - 1));
        region.imageIndex = (region.imageIndex + offset) % count;
      } else region.imageIndex = (region.imageIndex + 1) % count;
      for (const mount of region.mounts.values()) renderImage(mount, region, true);
    }, region.config.interval * 1000);
  }

  function removeMount(region: RegionRuntime, mount: MountedHost): void {
    region.mounts.delete(mount.host);
    mount.layer.remove();
    restoreStyles(mount.host, mount.savedStyles);
  }

  function addMount(region: RegionRuntime, host: HTMLElement): void {
    const savedStyles: SavedStyle[] = [];
    const computed = window!.getComputedStyle(host);
    if (computed.position === "static" || computed.position === "") {
      savedStyles.push(saveStyle(host, "position"));
      host.style.setProperty("position", "relative", "important");
    }
    if (computed.isolation !== "isolate") {
      savedStyles.push(saveStyle(host, "isolation"));
      host.style.setProperty("isolation", "isolate", "important");
    }
    const layer = document.createElement("div");
    layer.setAttribute("data-dsh-background-layer", region.name);
    layer.setAttribute("data-dsh-background-owner", ownerId);
    layer.setAttribute("aria-hidden", "true");
    if (region.name === "fullscreen") layer.style.position = "fixed";
    const planes = [document.createElement("div"), document.createElement("div")] as [HTMLDivElement, HTMLDivElement];
    planes.forEach((plane, index) => {
      plane.setAttribute("data-dsh-background-plane", String(index));
      plane.setAttribute("data-dsh-background-owner", ownerId);
      layer.append(plane);
    });
    host.prepend(layer);
    const mount: MountedHost = { host, layer, planes, activePlane: 0, image: "", savedStyles };
    region.mounts.set(host, mount);
    renderImage(mount, region, false);
  }

  function reconcileTransparentSurfaces(): void {
    const desired = new Map<HTMLElement, Record<string, string>>();
    const transparentBackground = { "background-color": "transparent" };
    function addWorkspaceSurfaces(host: HTMLElement): void {
      for (const surface of host.querySelectorAll('[data-slot="sidebar.workspaces"] > *')) {
        if (!(surface instanceof window!.HTMLElement) || owned(surface)) continue;
        // WorkspaceBrowser's bottom fade is the only consumer of this fill inside
        // the browsing subtree. Clear its endpoint without changing row states.
        desired.set(surface, { ...transparentBackground, "--dsw-specific-sidebar-fill": "transparent" });
      }
    }
    const fullscreen = regions[0]!;
    if (enabled(fullscreen)) {
      for (const mount of fullscreen.mounts.values()) {
        desired.set(mount.host, transparentBackground);
        // These are the opaque structural surfaces in Harness Web and Desktop.
        // Keep controls, menus, message cards, and other descendants untouched.
        for (const surface of mount.host.querySelectorAll('[data-slot="sidebar"] > *, [data-slot="main.conversation"] > *')) {
          if (surface instanceof window!.HTMLElement && !owned(surface)) desired.set(surface, transparentBackground);
        }
        for (const slot of mount.host.querySelectorAll('[data-slot="sidebar"], [data-slot="main"]')) {
          const column = slot.parentElement;
          if (column instanceof window!.HTMLElement && mount.host.contains(column)) desired.set(column, transparentBackground);
        }
        addWorkspaceSurfaces(mount.host);
      }
    }
    const sidebar = regions.find((region) => region.name === "sidebar")!;
    if (enabled(sidebar)) {
      for (const mount of sidebar.mounts.values()) addWorkspaceSurfaces(mount.host);
    }
    if (regions.some((region) => enabled(region) && region.mounts.size > 0)) {
      // Harness Settings portals beside the root, so it must be found document-wide.
      // Its nav/content are transparent; tint only the panel and shared settings cards.
      let settingsOpen = false;
      for (const panel of document.querySelectorAll('[data-shortcut-modal="settings"]')) {
        if (!(panel instanceof window!.HTMLElement) || owned(panel)) continue;
        settingsOpen = true;
        desired.set(panel, {
          "background-color": "color-mix(in srgb, var(--dsw-alias-bg-layer-2) 30%, transparent)",
          "--dsw-alias-settings-card-fill": "color-mix(in srgb, var(--dsw-alias-bg-layer-2) 20%, transparent)",
        });
        // The actual SettingsRoot mask is the panel's aria-hidden preceding sibling.
        // Keep the mask's click handling, but remove the fill/blur covering the image.
        const overlay = panel.parentElement;
        const mask = panel.previousElementSibling;
        if (overlay?.parentElement === document.body && overlay.getAttribute("role") === "presentation"
          && mask instanceof window!.HTMLElement && mask.getAttribute("aria-hidden") === "true") {
          desired.set(mask, { "background-color": "transparent", "backdrop-filter": "none" });
        }
      }
      if (settingsOpen) {
        for (const main of document.querySelectorAll('[data-slot="main"]')) {
          if (!(main instanceof window!.HTMLElement) || owned(main)) continue;
          // Hide underlying panel/chat text without changing layout or carousel layers.
          // Only our image elements consume the visibility override; Settings is a body portal.
          desired.set(main, {
            ...desired.get(main),
            visibility: "hidden",
            "--dsh-background-image-visibility": "visible",
          });
        }
      }
    }
    for (const [surface, saved] of transparentSurfaces) {
      const styles = desired.get(surface);
      if (!styles) {
        restoreStyles(surface, saved);
        transparentSurfaces.delete(surface);
      } else {
        const removed = saved.filter((style) => !Object.hasOwn(styles, style.property));
        if (removed.length > 0) {
          restoreStyles(surface, removed);
          transparentSurfaces.set(surface, saved.filter((style) => Object.hasOwn(styles, style.property)));
        }
      }
    }
    for (const [surface, styles] of desired) {
      let saved = transparentSurfaces.get(surface);
      if (!saved) {
        saved = [];
        transparentSurfaces.set(surface, saved);
      }
      for (const [property, value] of Object.entries(styles)) {
        if (saved.some((style) => style.property === property)) continue;
        saved.push(saveStyle(surface, property));
        surface.style.setProperty(property, value, "important");
      }
    }
  }

  function reconcile(): void {
    if (disposed) return;
    if (!styleElement.isConnected) (document.head ?? document.documentElement).append(styleElement);
    for (const region of regions) {
      const desired = new Set<HTMLElement>();
      if (enabled(region)) {
        for (const host of document.querySelectorAll(resolvedSelectors[region.name])) {
          if (host instanceof window!.HTMLElement && !owned(host)) desired.add(host);
        }
      }
      for (const mount of [...region.mounts.values()]) {
        if (!desired.has(mount.host) || !mount.layer.isConnected) removeMount(region, mount);
      }
      for (const host of desired) {
        if (!region.mounts.has(host)) addMount(region, host);
      }
      ensureTimer(region);
    }
    reconcileTransparentSurfaces();
  }

  function queueReconcile(): void {
    if (pendingReconcile || disposed) return;
    pendingReconcile = true;
    void Promise.resolve().then(() => {
      pendingReconcile = false;
      reconcile();
    });
  }

  function lostOwnedNode(node: Node): boolean {
    if (node === styleElement && !styleElement.isConnected) return true;
    for (const region of regions) {
      for (const mount of region.mounts.values()) {
        if (node === mount.layer && !mount.layer.isConnected) return true;
      }
    }
    return false;
  }

  const observer = new window.MutationObserver((records) => {
    for (const record of records) {
      if (owned(record.target)) continue;
      if (record.type === "attributes") {
        queueReconcile();
        return;
      }
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.some((node) => !owned(node) || lostOwnedNode(node))) {
        queueReconcile();
        return;
      }
    }
  });
  reconcile();
  observer.observe(document, { childList: true, subtree: true, attributes: true });

  return {
    update(nextConfig) {
      if (disposed) throw new Error("Cannot update disposed background layers");
      const next = normalizeConfig(nextConfig);
      for (const region of regions) {
        stopTimer(region);
        const currentImage = region.config.images[region.imageIndex];
        region.config = next[region.name];
        const retainedIndex = currentImage === undefined ? -1 : region.config.images.indexOf(currentImage);
        region.imageIndex = retainedIndex >= 0 ? retainedIndex : initialIndex(region.config);
      }
      config = next;
      reconcile();
      for (const region of regions) {
        for (const mount of region.mounts.values()) renderImage(mount, region, false);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      for (const region of regions) {
        stopTimer(region);
        for (const mount of [...region.mounts.values()]) removeMount(region, mount);
      }
      for (const [surface, saved] of transparentSurfaces) restoreStyles(surface, saved);
      transparentSurfaces.clear();
      styleElement.remove();
    },
  };
}
