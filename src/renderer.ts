import {
  REGION_NAMES,
  normalizeConfig,
  type BackgroundConfig,
  type RegionConfig,
  type RegionName,
  type RightSidebarLayout,
} from "./config.js";
import { createTitlebarBackgrounds, type TitlebarSource } from "./titlebar.js";

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
  layoutOverrides?: RightSidebarLayout;
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
    html[data-windows-titlebar] [data-dsh-background-caption-frame="${ownerId}"]::before {
      background-color: transparent !important;
    }
  `;
  const titlebar = createTitlebarBackgrounds(document, ownerId, styleElement);
  const regions = REGION_NAMES.map((name): RegionRuntime => ({
    name,
    config: config[name],
    imageIndex: initialIndex(config[name]),
    mounts: new Map(),
    timer: undefined,
  }));
  // Right sidebars reuse the sidebar settings, but each open panel owns its image/clock.
  const rightRegions = new Map<HTMLElement, RegionRuntime>();
  const transparentSurfaces = new Map<HTMLElement, SavedStyle[]>();

  function randomIndex(region: RegionConfig): number {
    return region.images.length > 1 ? Math.floor(Math.random() * region.images.length) : 0;
  }

  function initialIndex(region: RegionConfig): number {
    return region.random ? randomIndex(region) : 0;
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
    plane.style.backgroundSize = region.layoutOverrides?.size ?? override?.size ?? base.size;
    plane.style.backgroundPosition = region.layoutOverrides?.position ?? override?.position ?? base.position;
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
    titlebar.sync(mount);
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
    titlebar.remove(mount);
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
    if (region.name === "sidebar") {
      // Composite each sidebar image over its native theme fill.
      // Keep the fill outside the fading planes, including transparent/gapped images.
      layer.style.backgroundColor = "var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, Canvas))";
    }
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

  function reconcileMounts(region: RegionRuntime, desired: Set<HTMLElement>): void {
    for (const mount of [...region.mounts.values()]) {
      if (!desired.has(mount.host) || !mount.layer.isConnected) removeMount(region, mount);
    }
    for (const host of desired) {
      if (!region.mounts.has(host)) addMount(region, host);
    }
    ensureTimer(region);
  }

  function reconcileRightSidebars(): void {
    const desiredPanels = new Set<HTMLElement>();
    const sidebar = regions.find((region) => region.name === "sidebar")!;
    if (enabled(sidebar)) {
      for (const panel of document.querySelectorAll('[data-sidebar-right-panel][data-sidebar-right-session]')) {
        if (panel instanceof window!.HTMLElement && !owned(panel)
          && panel.hasAttribute("data-sidebar-right-open") && panel.closest('[hidden], [aria-hidden="true"]') === null) {
          desiredPanels.add(panel);
        }
      }
    }
    for (const [panel, region] of rightRegions) {
      if (desiredPanels.has(panel)) continue;
      stopTimer(region);
      for (const mount of [...region.mounts.values()]) removeMount(region, mount);
      rightRegions.delete(panel);
    }
    for (const panel of desiredPanels) {
      let region = rightRegions.get(panel);
      if (!region) {
        region = {
          name: "sidebar", config: sidebar.config, imageIndex: randomIndex(sidebar.config),
          layoutOverrides: config.sidebar.right,
          mounts: new Map(), timer: undefined,
        };
        rightRegions.set(panel, region);
      }
      const desired = new Set<HTMLElement>();
      // Mount inside docked panes, not their common shell: floats keep their own layers.
      for (const host of panel.querySelectorAll('[data-dockkit-host="dock"] > [data-dockkit-pane], [data-dockkit-empty] > [data-dockkit-pane]')) {
        if (host instanceof window!.HTMLElement && !owned(host) && host.closest('[hidden], [aria-hidden="true"]') === null) {
          desired.add(host);
        }
      }
      reconcileMounts(region, desired);
    }
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
        // TaskManagerPage paints bg-base over the global layer; its list and
        // scroll containers are already transparent in Harness Web and Desktop.
        for (const page of mount.host.querySelectorAll('[data-slot="main"] > [data-testid="task-manager-page"]')) {
          if (!(page instanceof window!.HTMLElement) || owned(page)) continue;
          desired.set(page, transparentBackground);
          // TaskDetail is the page's direct aside; keep its nested controls/cards.
          for (const detail of page.querySelectorAll(':scope > aside')) {
            if (detail instanceof window!.HTMLElement) desired.set(detail, transparentBackground);
          }
        }
        addWorkspaceSurfaces(mount.host);
      }
    }
    const sidebar = regions.find((region) => region.name === "sidebar")!;
    if (enabled(sidebar)) {
      for (const mount of sidebar.mounts.values()) addWorkspaceSurfaces(mount.host);
    }
    const chat = regions.find((region) => region.name === "chat")!;
    for (const trajectory of document.querySelectorAll('[data-slot="conversation.view"] > [data-conversation-composer-overlay]:has([data-trajectory-scroll])')) {
      if (!(trajectory instanceof window!.HTMLElement) || owned(trajectory)) continue;
      const background = [chat, fullscreen].find((region) => enabled(region)
        && [...region.mounts.keys()].some((host) => host.contains(trajectory)));
      if (!background) continue;
      // Trajectory lives inside ConversationRoot, so the existing chat layer wins
      // over fullscreen automatically. Only clear its verified structural surfaces.
      desired.set(trajectory, transparentBackground);
      for (const surface of trajectory.querySelectorAll(':scope > [role="toolbar"], :scope > section > div:first-child')) {
        if (surface instanceof window!.HTMLElement) desired.set(surface, transparentBackground);
      }
      for (const scroll of trajectory.querySelectorAll('[data-trajectory-scroll]')) {
        if (!(scroll instanceof window!.HTMLElement)) continue;
        desired.set(scroll, transparentBackground);
        const split = scroll.parentElement;
        if (split instanceof window!.HTMLElement && trajectory.contains(split)) desired.set(split, transparentBackground);
        for (const table of scroll.querySelectorAll(':scope > table')) {
          if (table instanceof window!.HTMLElement) desired.set(table, transparentBackground);
        }
      }
      const detail = trajectory.querySelector('#trajectory-detail-panel')?.closest('aside');
      if (detail instanceof window!.HTMLElement && trajectory.contains(detail)) desired.set(detail, transparentBackground);
    }
    for (const region of rightRegions.values()) {
      for (const mount of region.mounts.values()) {
        // The visible dock pane is itself the bg-base data-dockkit-content shell.
        if (mount.host.hasAttribute("data-dockkit-content")) desired.set(mount.host, transparentBackground);
        // Registered tab roots may paint a whole-pane fill; leave their controls intact.
        for (const surface of mount.host.querySelectorAll('[data-slot="sidebar.right.pane.tab"] > *')) {
          if (surface instanceof window!.HTMLElement && !owned(surface)) desired.set(surface, transparentBackground);
        }
      }
    }
    if ([...regions, ...rightRegions.values()].some((region) => enabled(region) && region.mounts.size > 0)) {
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
      reconcileMounts(region, desired);
    }
    reconcileRightSidebars();
    const fullscreen = regions.find((region) => region.name === "fullscreen")!;
    const sidebar = regions.find((region) => region.name === "sidebar")!;
    const captionSources: TitlebarSource[] = [...sidebar.mounts.values()].map((mount) => ({ mount, side: "left" }));
    for (const [panel, region] of rightRegions) {
      for (const mount of region.mounts.values()) captionSources.push({ mount, side: "right", panel });
    }
    titlebar.update([...fullscreen.mounts.keys()], captionSources);
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
    if (titlebar.lostNode(node)) return true;
    if (node === styleElement && !styleElement.isConnected) return true;
    for (const region of [...regions, ...rightRegions.values()]) {
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
      for (const region of rightRegions.values()) {
        stopTimer(region);
        const currentImage = region.config.images[region.imageIndex];
        region.config = next.sidebar;
        region.layoutOverrides = next.sidebar.right;
        const retainedIndex = currentImage === undefined ? -1 : region.config.images.indexOf(currentImage);
        region.imageIndex = retainedIndex >= 0 ? retainedIndex : randomIndex(region.config);
      }
      config = next;
      reconcile();
      for (const region of [...regions, ...rightRegions.values()]) {
        for (const mount of region.mounts.values()) renderImage(mount, region, false);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      titlebar.dispose();
      for (const region of [...regions, ...rightRegions.values()]) {
        stopTimer(region);
        for (const mount of [...region.mounts.values()]) removeMount(region, mount);
      }
      rightRegions.clear();
      for (const [surface, saved] of transparentSurfaces) restoreStyles(surface, saved);
      transparentSurfaces.clear();
      styleElement.remove();
    },
  };
}
