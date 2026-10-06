"use strict";
(() => {
  // src/config.ts
  var REGION_NAMES = [
    "fullscreen",
    "chat",
    "sidebar",
    "sessionList"
  ];
  var MAX_INTERVAL_SECONDS = 2147483647e-3;
  var ConfigValidationError = class extends Error {
    issues;
    constructor(issues) {
      super(`Invalid background configuration:
${issues.join("\n")}`);
      this.name = "ConfigValidationError";
      this.issues = [...issues];
    }
  };
  function defaultRegion() {
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
      styles: []
    };
  }
  function createDefaultConfig() {
    return {
      enabled: true,
      fullscreen: defaultRegion(),
      chat: defaultRegion(),
      sidebar: defaultRegion(),
      sessionList: defaultRegion()
    };
  }
  var REGION_KEYS = /* @__PURE__ */ new Set([
    "enabled",
    "images",
    "interval",
    "random",
    "opacity",
    "size",
    "position",
    "blur",
    "transition",
    "styles"
  ]);
  var IMAGE_STYLE_KEYS = /* @__PURE__ */ new Set(["opacity", "size", "position", "blur"]);
  var CONFIG_KEYS = /* @__PURE__ */ new Set(["enabled", ...REGION_NAMES]);
  var NUMBER_WITH_UNIT = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:px|%|em|rem|vh|vw|vmin|vmax)";
  var NONNEGATIVE_LENGTH = new RegExp(`^(?:${NUMBER_WITH_UNIT}|0(?:\\.0+)?)$`);
  var POSITION_LENGTH = new RegExp(`^[+-]?(?:${NUMBER_WITH_UNIT}|0(?:\\.0+)?)$`);
  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function checkKeys(value, allowed, path, issues) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) issues.push(`${path ? `${path}.` : ""}${key}: unknown setting`);
    }
  }
  function readBoolean(value, fallback, path, issues) {
    if (value === void 0) return fallback;
    if (typeof value === "boolean") return value;
    issues.push(`${path}: expected a boolean`);
    return fallback;
  }
  function readNumber(value, fallback, path, issues, max = Number.POSITIVE_INFINITY) {
    if (value === void 0) return fallback;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max) {
      return value;
    }
    const range = Number.isFinite(max) ? `between 0 and ${max}` : "at least 0";
    issues.push(`${path}: expected a finite number ${range}`);
    return fallback;
  }
  function validSize(value) {
    if (value === "cover" || value === "contain") return true;
    const tokens = value.split(/\s+/);
    return tokens.length <= 2 && tokens.every((token) => token === "auto" || NONNEGATIVE_LENGTH.test(token));
  }
  function validPosition(value) {
    const tokens = value.split(/\s+/);
    const horizontal = (token) => /^(left|right|center)$/.test(token);
    const vertical = (token) => /^(top|bottom|center)$/.test(token);
    const horizontalEdge = (token) => token === "left" || token === "right";
    const verticalEdge = (token) => token === "top" || token === "bottom";
    const length = (token) => POSITION_LENGTH.test(token);
    if (tokens.length === 1) return horizontal(tokens[0]) || vertical(tokens[0]) || length(tokens[0]);
    if (tokens.length === 2) {
      const [first, second] = tokens;
      return (horizontal(first) || length(first)) && (vertical(second) || length(second)) || vertical(first) && horizontal(second);
    }
    if (tokens.length === 3) {
      const [first, second, third] = tokens;
      return horizontalEdge(first) && length(second) && vertical(third) || horizontal(first) && verticalEdge(second) && length(third) || verticalEdge(first) && length(second) && horizontal(third) || vertical(first) && horizontalEdge(second) && length(third);
    }
    if (tokens.length === 4) {
      const [first, second, third, fourth] = tokens;
      return length(second) && length(fourth) && (horizontalEdge(first) && verticalEdge(third) || verticalEdge(first) && horizontalEdge(third));
    }
    return false;
  }
  function readVisualString(value, fallback, path, issues, kind) {
    if (value === void 0) return fallback;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
      if (kind === "size" ? validSize(normalized) : validPosition(normalized)) return normalized;
    }
    issues.push(`${path}: expected a valid background ${kind} using keywords, percentages, or CSS lengths`);
    return fallback;
  }
  function readImage(value, path, issues) {
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
    }
    issues.push(`${path}: only http://, https://, and data:image URLs are supported; import local files through the settings page`);
    return "";
  }
  function readImageStyle(value, path, issues) {
    if (!isRecord(value)) {
      issues.push(`${path}: expected an object with image visual overrides`);
      return {};
    }
    checkKeys(value, IMAGE_STYLE_KEYS, path, issues);
    const result = {};
    if (value.opacity !== void 0) result.opacity = readNumber(value.opacity, 0.3, `${path}.opacity`, issues, 1);
    if (value.size !== void 0) result.size = readVisualString(value.size, "cover", `${path}.size`, issues, "size");
    if (value.position !== void 0) result.position = readVisualString(value.position, "center", `${path}.position`, issues, "position");
    if (value.blur !== void 0) result.blur = readNumber(value.blur, 0, `${path}.blur`, issues);
    return result;
  }
  function readRegion(value, path, issues) {
    const fallback = defaultRegion();
    if (value === void 0) return fallback;
    if (!isRecord(value)) {
      issues.push(`${path}: expected a region configuration object`);
      return fallback;
    }
    checkKeys(value, REGION_KEYS, path, issues);
    let images = [];
    if (value.images !== void 0) {
      if (Array.isArray(value.images)) {
        images = Array.from(value.images, (image, index) => readImage(image, `${path}.images[${index}]`, issues));
      } else issues.push(`${path}.images: expected an array of image URLs`);
    }
    let styles = [];
    if (value.styles !== void 0) {
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
      styles
    };
  }
  function normalizeConfig(input) {
    if (input === void 0) return createDefaultConfig();
    if (!isRecord(input)) throw new ConfigValidationError(["configuration: expected an object"]);
    const issues = [];
    checkKeys(input, CONFIG_KEYS, "", issues);
    const result = {
      enabled: readBoolean(input.enabled, true, "enabled", issues),
      fullscreen: readRegion(input.fullscreen, "fullscreen", issues),
      chat: readRegion(input.chat, "chat", issues),
      sidebar: readRegion(input.sidebar, "sidebar", issues),
      sessionList: readRegion(input.sessionList, "sessionList", issues)
    };
    if (issues.length > 0) throw new ConfigValidationError(issues);
    return result;
  }

  // src/renderer.ts
  var DEFAULT_SELECTORS = {
    fullscreen: '[data-dsh-background-region="fullscreen"], [data-slot="root"] > *',
    chat: '[data-dsh-background-region="chat"], [data-slot="main.conversation"] > *',
    sidebar: '[data-dsh-background-region="sidebar"], [data-slot="sidebar"] > *',
    sessionList: '[data-dsh-background-region="sessionList"], [data-slot="sidebar.workspaces"] > *'
  };
  var nextOwnerId = 0;
  function saveStyle(element, property) {
    return {
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property)
    };
  }
  function restoreStyles(element, saved) {
    for (const style of saved) {
      if (style.value === "") element.style.removeProperty(style.property);
      else element.style.setProperty(style.property, style.value, style.priority);
    }
  }
  function imageCssUrl(source) {
    return `url("${source.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, "")}")`;
  }
  function mountBackgrounds(document2, initialConfig, selectors = {}) {
    const window2 = document2.defaultView;
    if (!window2) throw new Error("Backgrounds require a document attached to a browser window");
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
        document2.querySelectorAll(selector);
      } catch {
        throw new Error(`Invalid background selector for ${name}: ${selector}`);
      }
    }
    const styleElement = document2.createElement("style");
    styleElement.setAttribute("data-dsh-background-styles", ownerId);
    styleElement.setAttribute("data-dsh-background-owner", ownerId);
    styleElement.textContent = `
    [data-dsh-background-layer][data-dsh-background-owner="${ownerId}"] {
      position: absolute; inset: 0; z-index: -1; overflow: hidden;
      pointer-events: none !important; user-select: none !important;
      border-radius: inherit;
    }
    [data-dsh-background-plane][data-dsh-background-owner="${ownerId}"] {
      position: absolute; inset: 0; opacity: 0;
      background-repeat: no-repeat; pointer-events: none !important;
    }
  `;
    const regions = REGION_NAMES.map((name) => ({
      name,
      config: config[name],
      imageIndex: initialIndex(config[name]),
      mounts: /* @__PURE__ */ new Map(),
      timer: void 0
    }));
    const transparentSurfaces = /* @__PURE__ */ new Map();
    function initialIndex(region) {
      return region.random && region.images.length > 1 ? Math.floor(Math.random() * region.images.length) : 0;
    }
    function enabled(region) {
      return config.enabled && region.config.enabled && region.config.images.length > 0;
    }
    function owned(node) {
      let element = node.nodeType === 1 ? node : node.parentElement;
      while (element) {
        if (element.getAttribute("data-dsh-background-owner") === ownerId) return true;
        element = element.parentElement;
      }
      return false;
    }
    function stopTimer(region) {
      if (region.timer !== void 0) window2.clearInterval(region.timer);
      region.timer = void 0;
    }
    function applyPlane(plane, region) {
      const base = region.config;
      const override = base.styles[region.imageIndex];
      const blur = override?.blur ?? base.blur;
      plane.style.backgroundImage = imageCssUrl(base.images[region.imageIndex]);
      plane.style.backgroundSize = override?.size ?? base.size;
      plane.style.backgroundPosition = override?.position ?? base.position;
      plane.style.filter = blur === 0 ? "none" : `blur(${blur}px)`;
      plane.style.inset = blur === 0 ? "0px" : `${-Math.ceil(blur * 2)}px`;
      plane.style.transition = `opacity ${base.transition}s ease`;
      return override?.opacity ?? base.opacity;
    }
    function renderImage(mount, region, animate) {
      const source = region.config.images[region.imageIndex];
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
        void next.offsetWidth;
        previous.style.opacity = "0";
        next.style.opacity = String(opacity);
        mount.activePlane = nextPlane;
      }
      mount.image = source;
    }
    function ensureTimer(region) {
      const shouldRotate = enabled(region) && region.mounts.size > 0 && region.config.images.length > 1 && region.config.interval > 0;
      if (!shouldRotate) {
        stopTimer(region);
        return;
      }
      if (region.timer !== void 0) return;
      region.timer = window2.setInterval(() => {
        if (disposed) return;
        const count = region.config.images.length;
        if (region.config.random) {
          const offset = 1 + Math.floor(Math.random() * (count - 1));
          region.imageIndex = (region.imageIndex + offset) % count;
        } else region.imageIndex = (region.imageIndex + 1) % count;
        for (const mount of region.mounts.values()) renderImage(mount, region, true);
      }, region.config.interval * 1e3);
    }
    function removeMount(region, mount) {
      region.mounts.delete(mount.host);
      mount.layer.remove();
      restoreStyles(mount.host, mount.savedStyles);
    }
    function addMount(region, host) {
      const savedStyles = [];
      const computed = window2.getComputedStyle(host);
      if (computed.position === "static" || computed.position === "") {
        savedStyles.push(saveStyle(host, "position"));
        host.style.setProperty("position", "relative", "important");
      }
      if (computed.isolation !== "isolate") {
        savedStyles.push(saveStyle(host, "isolation"));
        host.style.setProperty("isolation", "isolate", "important");
      }
      const layer = document2.createElement("div");
      layer.setAttribute("data-dsh-background-layer", region.name);
      layer.setAttribute("data-dsh-background-owner", ownerId);
      layer.setAttribute("aria-hidden", "true");
      if (region.name === "fullscreen") layer.style.position = "fixed";
      const planes = [document2.createElement("div"), document2.createElement("div")];
      planes.forEach((plane, index) => {
        plane.setAttribute("data-dsh-background-plane", String(index));
        plane.setAttribute("data-dsh-background-owner", ownerId);
        layer.append(plane);
      });
      host.prepend(layer);
      const mount = { host, layer, planes, activePlane: 0, image: "", savedStyles };
      region.mounts.set(host, mount);
      renderImage(mount, region, false);
    }
    function reconcileTransparentSurfaces() {
      const desired = /* @__PURE__ */ new Set();
      const fullscreen = regions[0];
      if (enabled(fullscreen)) {
        for (const mount of fullscreen.mounts.values()) {
          desired.add(mount.host);
          for (const surface of mount.host.querySelectorAll('[data-slot="sidebar"] > *, [data-slot="main.conversation"] > *')) {
            if (surface instanceof window2.HTMLElement && !owned(surface)) desired.add(surface);
          }
          for (const slot of mount.host.querySelectorAll('[data-slot="sidebar"], [data-slot="main"]')) {
            const column = slot.parentElement;
            if (column instanceof window2.HTMLElement && mount.host.contains(column)) desired.add(column);
          }
        }
      }
      for (const [surface, saved] of transparentSurfaces) {
        if (!desired.has(surface)) {
          restoreStyles(surface, saved);
          transparentSurfaces.delete(surface);
        }
      }
      for (const surface of desired) {
        if (!transparentSurfaces.has(surface)) {
          transparentSurfaces.set(surface, [saveStyle(surface, "background-color")]);
          surface.style.setProperty("background-color", "transparent", "important");
        }
      }
    }
    function reconcile() {
      if (disposed) return;
      if (!styleElement.isConnected) (document2.head ?? document2.documentElement).append(styleElement);
      for (const region of regions) {
        const desired = /* @__PURE__ */ new Set();
        if (enabled(region)) {
          for (const host of document2.querySelectorAll(resolvedSelectors[region.name])) {
            if (host instanceof window2.HTMLElement && !owned(host)) desired.add(host);
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
    function queueReconcile() {
      if (pendingReconcile || disposed) return;
      pendingReconcile = true;
      void Promise.resolve().then(() => {
        pendingReconcile = false;
        reconcile();
      });
    }
    function lostOwnedNode(node) {
      if (node === styleElement && !styleElement.isConnected) return true;
      for (const region of regions) {
        for (const mount of region.mounts.values()) {
          if (node === mount.layer && !mount.layer.isConnected) return true;
        }
      }
      return false;
    }
    const observer = new window2.MutationObserver((records) => {
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
    observer.observe(document2, { childList: true, subtree: true, attributes: true });
    return {
      update(nextConfig) {
        if (disposed) throw new Error("Cannot update disposed background layers");
        const next = normalizeConfig(nextConfig);
        for (const region of regions) {
          stopTimer(region);
          const currentImage = region.config.images[region.imageIndex];
          region.config = next[region.name];
          const retainedIndex = currentImage === void 0 ? -1 : region.config.images.indexOf(currentImage);
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
      }
    };
  }

  // src/settings.ts
  var LABELS = {
    fullscreen: "\u5168\u5C40\u80CC\u666F",
    chat: "\u804A\u5929\u533A\u57DF",
    sidebar: "\u4FA7\u8FB9\u680F",
    sessionList: "\u4F1A\u8BDD\u5217\u8868"
  };
  var CSS = `
.dsh-bg-settings{font:inherit;color:inherit;max-width:860px;padding:8px;line-height:1.6}
.dsh-bg-settings *{box-sizing:border-box}
.dsh-bg-settings h2{font-size:22px;margin:0 0 8px}.dsh-bg-settings p{margin:8px 0}
.dsh-bg-settings .bg-muted{opacity:.72;font-size:13px}
.dsh-bg-settings .bg-tabs,.dsh-bg-settings .bg-actions{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
.dsh-bg-settings button,.dsh-bg-settings input,.dsh-bg-settings select,.dsh-bg-settings textarea{font:inherit;color:inherit;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:8px;background:transparent;padding:8px 12px}
.dsh-bg-settings button{cursor:pointer}.dsh-bg-settings button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.dsh-bg-settings button[aria-pressed=true],.dsh-bg-settings .bg-primary{background:#2563eb;color:#fff;border-color:#2563eb}
.dsh-bg-settings button.bg-primary:hover,.dsh-bg-settings button[aria-pressed=true]:hover{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
.dsh-bg-settings button:focus-visible,.dsh-bg-settings input:focus-visible,.dsh-bg-settings textarea:focus-visible,.dsh-bg-settings select:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
.dsh-bg-settings .bg-card{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;padding:16px;margin-bottom:16px}
.dsh-bg-settings .bg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.dsh-bg-settings .bg-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-bg-settings .bg-check{display:flex;align-items:center;gap:8px}.dsh-bg-settings .bg-check input{accent-color:#2563eb}
.dsh-bg-settings .bg-url{display:flex;gap:8px;margin:12px 0}.dsh-bg-settings .bg-url input{flex:1;min-width:0}
.dsh-bg-settings .bg-image{display:flex;align-items:center;gap:12px;margin:10px 0;padding:8px;border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent)}
.dsh-bg-settings .bg-image img{width:84px;height:56px;object-fit:cover;border-radius:6px}.dsh-bg-settings .bg-image span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-bg-settings textarea{width:100%;min-height:280px;font-family:ui-monospace,monospace;font-size:13px}
.dsh-bg-settings [role=status]{min-height:24px;white-space:pre-wrap}.dsh-bg-settings [data-error=true]{color:#ef4444}
.dsh-bg-settings summary{cursor:pointer;margin:12px 0}.dsh-bg-settings input[type=file]{max-width:100%}
`;
  function readFile(document2, file, asDataUrl) {
    return new Promise((resolve, reject) => {
      const Reader = document2.defaultView?.FileReader;
      if (!Reader) return reject(new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u5BFC\u5165\u3002"));
      const reader = new Reader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`\u65E0\u6CD5\u8BFB\u53D6 ${file.name}`));
      if (asDataUrl) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }
  function createSettingsPanel(document2, initialConfig, onSave) {
    const root = document2.createElement("section");
    root.className = "dsh-bg-settings";
    root.setAttribute("aria-label", "\u80CC\u666F\u8BBE\u7F6E");
    let draft = normalizeConfig(initialConfig);
    let selected = "chat";
    let status;
    function el(tag, text) {
      const element = document2.createElement(tag);
      if (text !== void 0) element.textContent = text;
      return element;
    }
    function message(text, isError = false) {
      status.textContent = text;
      status.dataset.error = String(isError);
    }
    function action(text, handler, primary = false) {
      const button = el("button", text);
      button.type = "button";
      if (primary) button.className = "bg-primary";
      button.addEventListener("click", handler);
      return button;
    }
    function check(text, value, onChange) {
      const label = el("label");
      label.className = "bg-check";
      const input = el("input");
      input.type = "checkbox";
      input.checked = value;
      input.addEventListener("change", () => onChange(input.checked));
      label.append(input, document2.createTextNode(text));
      return label;
    }
    function render() {
      root.replaceChildren();
      const style = el("style", CSS);
      root.append(style, el("h2", "\u80CC\u666F\u8BBE\u7F6E"), el("p", "\u4E3A\u5168\u5C40\u3001\u804A\u5929\u3001\u4FA7\u8FB9\u680F\u548C\u4F1A\u8BDD\u5217\u8868\u5206\u522B\u8BBE\u7F6E\u56FE\u7247\u4E0E\u8F6E\u64AD\u3002"));
      root.append(check("\u542F\u7528\u80CC\u666F\u63D2\u4EF6", draft.enabled, (value) => {
        draft.enabled = value;
      }));
      const tabs = el("div");
      tabs.className = "bg-tabs";
      tabs.setAttribute("aria-label", "\u80CC\u666F\u533A\u57DF");
      for (const region of REGION_NAMES) {
        const button = action(LABELS[region], () => {
          selected = region;
          render();
        });
        button.setAttribute("aria-pressed", String(selected === region));
        button.dataset.region = region;
        tabs.append(button);
      }
      root.append(tabs);
      const config = draft[selected];
      const card = el("div");
      card.className = "bg-card";
      card.append(el("h3", `${LABELS[selected]} \xB7 ${selected}`));
      card.append(check("\u542F\u7528\u6B64\u533A\u57DF", config.enabled, (value) => {
        config.enabled = value;
      }));
      const grid = el("div");
      grid.className = "bg-grid";
      function field(text, name, input) {
        const label = el("label");
        label.className = "bg-field";
        input.name = name;
        label.append(el("span", text), input);
        grid.append(label);
      }
      for (const [key, label, min, max, step] of [
        ["opacity", "\u56FE\u7247\u4E0D\u900F\u660E\u5EA6\uFF080\u20131\uFF09", 0, 1, 0.05],
        ["interval", "\u8F6E\u64AD\u95F4\u9694\uFF08\u79D2\uFF0C0 \u8868\u793A\u505C\u6B62\uFF09", 0, void 0, 1],
        ["blur", "\u6A21\u7CCA\u7A0B\u5EA6\uFF08\u50CF\u7D20\uFF09", 0, void 0, 1],
        ["transition", "\u5207\u6362\u8FC7\u6E21\uFF08\u79D2\uFF09", 0, void 0, 0.1]
      ]) {
        const input = el("input");
        input.type = "number";
        input.value = String(config[key]);
        input.min = String(min);
        if (max !== void 0) input.max = String(max);
        input.step = String(step);
        input.addEventListener("input", () => {
          config[key] = input.value === "" ? NaN : Number(input.value);
        });
        field(label, key, input);
      }
      const size = el("input");
      size.type = "text";
      size.value = config.size;
      size.placeholder = "cover / contain / 100% auto";
      size.addEventListener("input", () => {
        config.size = size.value;
      });
      field("\u56FE\u7247\u7F29\u653E\u65B9\u5F0F", "size", size);
      const position = el("input");
      position.type = "text";
      position.value = config.position;
      position.placeholder = "center / right bottom";
      position.addEventListener("input", () => {
        config.position = position.value;
      });
      field("\u56FE\u7247\u4F4D\u7F6E", "position", position);
      card.append(grid, check("\u968F\u673A\u64AD\u653E", config.random, (value) => {
        config.random = value;
      }));
      const images = el("div");
      images.className = "bg-card";
      images.append(el("h3", `\u56FE\u7247\u5217\u8868\uFF08${config.images.length}\uFF09`));
      const hint = el("p", "\u652F\u6301 HTTP(S) \u56FE\u7247\u5730\u5740\u6216\u5BFC\u5165\u672C\u5730\u56FE\u7247\u3002\u672C\u5730\u56FE\u7247\u4FDD\u5B58\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u6216\u684C\u9762\u7AEF\uFF1B\u5EFA\u8BAE\u4F7F\u7528\u538B\u7F29\u540E\u7684\u56FE\u7247\u3002");
      hint.className = "bg-muted";
      images.append(hint);
      const row = el("div");
      row.className = "bg-url";
      const url = el("input");
      url.type = "url";
      url.placeholder = "https://example.com/background.jpg";
      url.setAttribute("aria-label", "\u56FE\u7247\u5730\u5740");
      row.append(url, action("\u6DFB\u52A0\u56FE\u7247\u5730\u5740", () => {
        try {
          if (!url.value.trim()) throw new Error("\u8BF7\u8F93\u5165\u56FE\u7247\u5730\u5740\u3002");
          const next = normalizeConfig({ ...draft, [selected]: { ...config, images: [...config.images, url.value.trim()] } });
          draft = next;
          render();
          message("\u56FE\u7247\u5DF2\u6DFB\u52A0\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002");
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      }));
      images.append(row);
      const uploadLabel = el("label");
      uploadLabel.className = "bg-field";
      uploadLabel.append(el("span", "\u5BFC\u5165\u672C\u5730\u56FE\u7247"));
      const upload = el("input");
      upload.type = "file";
      upload.accept = "image/*";
      upload.multiple = true;
      upload.addEventListener("change", async () => {
        const files = Array.from(upload.files ?? []);
        if (!files.length) return;
        const region = selected;
        try {
          const sources = await Promise.all(files.map((file) => {
            if (!file.type.startsWith("image/")) throw new Error(`${file.name} \u4E0D\u662F\u56FE\u7247\u6587\u4EF6\u3002`);
            return readFile(document2, file, true);
          }));
          draft = normalizeConfig({ ...draft, [region]: { ...draft[region], images: [...draft[region].images, ...sources] } });
          render();
          message(`\u5DF2\u5BFC\u5165 ${sources.length} \u5F20\u56FE\u7247\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002`);
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      });
      uploadLabel.append(upload);
      images.append(uploadLabel);
      config.images.forEach((source, index) => {
        const imageRow = el("div");
        imageRow.className = "bg-image";
        const image = el("img");
        image.src = source;
        image.alt = `${LABELS[selected]}\u56FE\u7247 ${index + 1}`;
        const title = el("span", source.startsWith("data:") ? `\u672C\u5730\u56FE\u7247 ${index + 1}` : source);
        title.title = source.startsWith("data:") ? "\u5BFC\u5165\u7684\u672C\u5730\u56FE\u7247" : source;
        imageRow.append(image, title, action("\u79FB\u9664", () => {
          config.images.splice(index, 1);
          config.styles.splice(index, 1);
          render();
        }));
        images.append(imageRow);
      });
      root.append(card, images);
      const actions = el("div");
      actions.className = "bg-actions";
      actions.append(action("\u4FDD\u5B58\u5E76\u5E94\u7528", () => {
        try {
          const next = normalizeConfig(draft);
          onSave(next);
          draft = next;
          render();
          message("\u80CC\u666F\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u5E94\u7528\u3002");
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      }, true), action("\u6062\u590D\u9ED8\u8BA4\u914D\u7F6E", () => {
        draft = createDefaultConfig();
        render();
        message("\u5DF2\u6062\u590D\u9ED8\u8BA4\u914D\u7F6E\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002");
      }));
      root.append(actions);
      const advanced = el("details");
      advanced.append(el("summary", "\u9AD8\u7EA7\u53C2\u6570 JSON / \u5BFC\u5165\u5BFC\u51FA"));
      const json = el("textarea");
      json.setAttribute("aria-label", "\u80CC\u666F\u914D\u7F6E JSON");
      json.spellcheck = false;
      json.value = JSON.stringify(draft, null, 2);
      advanced.addEventListener("toggle", () => {
        if (advanced.open) json.value = JSON.stringify(draft, null, 2);
      });
      const advancedActions = el("div");
      advancedActions.className = "bg-actions";
      advancedActions.append(action("\u8F7D\u5165 JSON", () => {
        try {
          draft = normalizeConfig(JSON.parse(json.value));
          render();
          message("JSON \u5DF2\u8F7D\u5165\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002");
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      }), action("\u5BFC\u51FA\u914D\u7F6E", () => {
        try {
          const next = normalizeConfig(draft);
          const link = el("a");
          link.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(next, null, 2))}`;
          link.download = "dsh-background.json";
          link.click();
          message("\u914D\u7F6E\u5DF2\u5BFC\u51FA\u3002");
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      }));
      const importLabel = el("label");
      importLabel.className = "bg-field";
      importLabel.append(el("span", "\u5BFC\u5165\u914D\u7F6E JSON"));
      const importFile = el("input");
      importFile.type = "file";
      importFile.accept = ".json,application/json";
      importFile.addEventListener("change", async () => {
        const file = importFile.files?.[0];
        if (!file) return;
        try {
          draft = normalizeConfig(JSON.parse(await readFile(document2, file, false)));
          render();
          message("\u914D\u7F6E\u5DF2\u5BFC\u5165\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002");
        } catch (cause) {
          message(cause instanceof Error ? cause.message : String(cause), true);
        }
      });
      importLabel.append(importFile);
      const advancedHint = el("p", "\u4F7F\u7528 fullscreen\u3001chat\u3001sidebar\u3001sessionList \u53C2\u6570\u914D\u7F6E\u5404\u533A\u57DF\u3002styles[i] \u53EF\u8986\u76D6\u7B2C i \u5F20\u56FE\u7247\u7684 opacity\u3001size\u3001position \u548C blur\u3002");
      advancedHint.className = "bg-muted";
      advanced.append(advancedHint, json, advancedActions, importLabel);
      root.append(advanced);
      status = el("p");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      root.append(status);
    }
    render();
    return root;
  }

  // src/storage.ts
  var STORAGE_KEY = "dsh-background.config.v1";
  function createConfigStore(window2) {
    let current = createDefaultConfig();
    let error;
    const listeners = /* @__PURE__ */ new Set();
    try {
      const saved = window2.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) current = normalizeConfig(JSON.parse(saved));
    } catch (cause) {
      error = `\u65E0\u6CD5\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u80CC\u666F\u914D\u7F6E\uFF1A${cause instanceof Error ? cause.message : String(cause)}\u3002\u5F53\u524D\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E\uFF0C\u53EF\u5728\u6B64\u91CD\u65B0\u4FDD\u5B58\u3002`;
    }
    function notify() {
      for (const listener of listeners) listener(normalizeConfig(current));
    }
    function onStorage(event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      if (event.storageArea && event.storageArea !== window2.localStorage) return;
      try {
        current = event.newValue === null ? createDefaultConfig() : normalizeConfig(JSON.parse(event.newValue));
        error = void 0;
        notify();
      } catch {
      }
    }
    window2.addEventListener("storage", onStorage);
    return {
      load() {
        return { config: normalizeConfig(current), ...error ? { error } : {} };
      },
      save(input) {
        const next = normalizeConfig(input);
        try {
          window2.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (cause) {
          throw new Error(`\u80CC\u666F\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u51CF\u5C11\u5BFC\u5165\u56FE\u7247\u7684\u5927\u5C0F\u6216\u6570\u91CF\uFF1A${cause instanceof Error ? cause.message : String(cause)}`);
        }
        current = next;
        error = void 0;
        notify();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      dispose() {
        window2.removeEventListener("storage", onStorage);
        listeners.clear();
      }
    };
  }

  // src/client.ts
  window.__ModuleLoader__.load({
    id: "dsh-background",
    factory(require2) {
      const React = require2("react");
      return {
        inject: ["slots"],
        apply(ctx) {
          ctx.effect(() => {
            const store = createConfigStore(window);
            const renderer = mountBackgrounds(document, store.load().config);
            const unsubscribe = store.subscribe((config) => renderer.update(config));
            function BackgroundSettings() {
              const container = React.useRef(null);
              React.useEffect(() => {
                const parent = container.current;
                if (!parent) return;
                const saved = store.load();
                const panel = createSettingsPanel(document, saved.config, (config) => store.save(config));
                if (saved.error) {
                  const notice = document.createElement("p");
                  notice.setAttribute("role", "alert");
                  notice.textContent = saved.error;
                  panel.prepend(notice);
                }
                parent.append(panel);
                return () => panel.remove();
              }, []);
              return React.createElement("div", {
                ref: container,
                style: { height: "100%", minHeight: 0, overflow: "auto" },
                "data-dsh-background-settings": ""
              });
            }
            const unregister = ctx.slots.inject("settings.section", () => ctx.slots.register({
              name: "settings.section",
              id: "dsh-background",
              order: 35,
              label: "\u80CC\u666F / Background"
            }, BackgroundSettings));
            return () => {
              unregister();
              unsubscribe();
              renderer.dispose();
              store.dispose();
            };
          }, "dsh-background: preferences, surfaces, and settings");
        }
      };
    }
  });
})();
