interface ImageMount {
  host: HTMLElement;
  layer: HTMLDivElement;
  planes: [HTMLDivElement, HTMLDivElement];
}

export interface TitlebarSource {
  mount: ImageMount;
  side: "left" | "right";
  panel?: HTMLElement;
}

interface CaptionImage {
  clip: HTMLDivElement;
  scene: HTMLDivElement;
  planes: [HTMLDivElement, HTMLDivElement];
  paint: [string, string];
}

/** Projects each sidebar's existing image scene into the native caption strip. */
export function createTitlebarBackgrounds(document: Document, owner: string, style: HTMLStyleElement) {
  const window = document.defaultView!;
  const images = new Map<ImageMount, CaptionImage>();
  const observed = new Set<Element>();
  let sources: TitlebarSource[] = [];
  let fullscreenHosts: HTMLElement[] = [];
  let disposed = false;
  let queued = false;
  let frameStyle: { frame: HTMLElement; attribute: string | null } | undefined;
  let probeStyle: { probe: HTMLElement; value: string; priority: string } | undefined;
  const pulse = document.createTextNode("");
  style.append(pulse);
  const resize = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(queue) : undefined;
  const transitions = new Map<Element, Set<string>>();
  let animation: number | undefined;

  function notifyAppearance(): void {
    // Official preload observes head text, but not the probe's own attributes.
    pulse.data = pulse.data === "" ? "\n" : "";
  }

  function setProbe(active: boolean): void {
    if (probeStyle && (!active || !probeStyle.probe.isConnected)) {
      const { probe, value, priority } = probeStyle;
      if (value === "") probe.style.removeProperty("background-color");
      else probe.style.setProperty("background-color", value, priority);
      probeStyle = undefined;
      notifyAppearance();
    }
    if (!active || probeStyle) return;
    // preload-windows.ts (including rc.2) creates exactly this unmarked body span.
    // Match all of its declarations; do not alter theme tokens or symbol color.
    const candidates = [...document.body.children].filter((element) => {
      if (!(element instanceof window.HTMLElement) || element.tagName !== "SPAN") return false;
      const css = element.style;
      return css.getPropertyValue("position") === "fixed" && css.getPropertyValue("visibility") === "hidden"
        && css.getPropertyValue("pointer-events") === "none"
        && css.getPropertyValue("background-color") === "var(--dsw-specific-sidebar-fill)"
        && css.getPropertyValue("color") === "var(--dsw-alias-label-primary)";
    });
    if (candidates.length !== 1) return;
    const probe = candidates[0] as HTMLElement;
    probeStyle = { probe, value: probe.style.getPropertyValue("background-color"), priority: probe.style.getPropertyPriority("background-color") };
    probe.style.setProperty("background-color", "transparent", "important");
    notifyAppearance();
  }

  function setFrame(frame: HTMLElement | undefined): void {
    if (frameStyle?.frame === frame) return;
    if (frameStyle) {
      if (frameStyle.attribute === null) frameStyle.frame.removeAttribute("data-dsh-background-caption-frame");
      else frameStyle.frame.setAttribute("data-dsh-background-caption-frame", frameStyle.attribute);
      frameStyle = undefined;
    }
    if (frame) {
      frameStyle = { frame, attribute: frame.getAttribute("data-dsh-background-caption-frame") };
      frame.setAttribute("data-dsh-background-caption-frame", owner);
    }
  }

  function remove(mount: ImageMount): void {
    images.get(mount)?.clip.remove();
    images.delete(mount);
    mount.layer.style.removeProperty("top");
  }

  function sync(mount: ImageMount): void {
    const image = images.get(mount);
    if (!image) return;
    mount.planes.forEach((plane, index) => {
      const css = plane.style.cssText;
      if (image.paint[index] === css) return;
      image.paint[index] = css;
      const copy = image.planes[index]!;
      copy.style.cssText = css;
      copy.style.position = "absolute";
      copy.style.inset = plane.style.inset || "0px";
      copy.style.backgroundRepeat = "no-repeat";
      copy.style.pointerEvents = "none";
      copy.style.visibility = "var(--dsh-background-image-visibility, inherit)";
    });
  }

  function ownedDiv(marker: string): HTMLDivElement {
    const node = document.createElement("div");
    node.setAttribute(marker, "");
    node.setAttribute("data-dsh-background-owner", owner);
    return node;
  }

  function watch(elements: Set<Element>): void {
    for (const element of observed) {
      if (elements.has(element)) continue;
      resize?.unobserve(element);
      observed.delete(element);
      transitions.delete(element);
    }
    for (const element of elements) {
      if (observed.has(element)) continue;
      observed.add(element);
      resize?.observe(element);
    }
    if (transitions.size === 0 && animation !== undefined) {
      window.cancelAnimationFrame(animation);
      animation = undefined;
    }
  }

  function refresh(): void {
    if (disposed) return;
    const root = document.documentElement;
    const candidate = root.hasAttribute("data-windows-titlebar")
      ? document.querySelector("[data-shell-overlay]")?.parentElement : undefined;
    const frame = candidate instanceof window.HTMLElement ? candidate : undefined;
    const rect = frame?.getBoundingClientRect();
    // Native fullscreen retains this padding in Harness; follow actual geometry.
    const height = frame ? Math.min(
      Number.parseFloat(window.getComputedStyle(root).getPropertyValue("--dsh-windows-titlebar-height")) || 0,
      Number.parseFloat(window.getComputedStyle(frame).paddingTop) || 0,
    ) : 0;
    const active = frame && rect && rect.width > 0 && rect.height > height && height > 0;
    const global = !!active && fullscreenHosts.some((host) => host === frame || host.contains(frame!));
    const desired = new Set<ImageMount>();
    const elements = new Set<Element>();
    if (active && (global || sources.length > 0)) {
      elements.add(frame);
      for (const source of sources) {
        const { mount, side, panel } = source;
        if (!mount.host.isConnected || !frame.contains(mount.host)
          || mount.host.closest('[hidden], [aria-hidden="true"]')) continue;
        const body = mount.host.getBoundingClientRect();
        const column = side === "left" ? mount.host.closest('[data-slot="sidebar"]')?.parentElement : panel;
        if (!column) continue;
        const columnRect = column.getBoundingClientRect();
        elements.add(column);
        elements.add(mount.host);
        if (side === "right" && mount.host.parentElement) elements.add(mount.host.parentElement);
        if (side === "right" && (!panel?.hasAttribute("data-sidebar-right-open") || Math.abs(body.top - columnRect.top) > 1)) continue;
        const computed = window.getComputedStyle(mount.host);
        const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
        const borderRight = Number.parseFloat(computed.borderRightWidth) || 0;
        const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
        const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
        const origin = body.left + borderLeft;
        const width = body.width - borderLeft - borderRight;
        const offset = body.top + borderTop - rect.top;
        const left = Math.max(origin, columnRect.left, rect.left);
        const right = Math.min(origin + width, columnRect.right, rect.right);
        if (body.height <= 0 || width <= 0 || right <= left || offset < height - 1) continue;
        desired.add(mount);
        let image = images.get(mount);
        if (image && !image.clip.isConnected) remove(mount);
        image = images.get(mount);
        if (!image) {
          const clip = ownedDiv("data-dsh-background-caption");
          clip.setAttribute("data-dsh-background-caption", side);
          clip.setAttribute("aria-hidden", "true");
          Object.assign(clip.style, { position: "absolute", overflow: "hidden", pointerEvents: "none", userSelect: "none", zIndex: "0" });
          const scene = ownedDiv("data-dsh-background-caption-scene");
          scene.style.position = "absolute";
          const planes = [ownedDiv("data-dsh-background-caption-plane"), ownedDiv("data-dsh-background-caption-plane")] as [HTMLDivElement, HTMLDivElement];
          scene.append(...planes);
          clip.append(scene);
          // Before the columns' stacking contexts, so fixed sidebar controls stay above it.
          frame.prepend(clip);
          image = { clip, scene, planes, paint: ["unset", "unset"] };
          images.set(mount, image);
        }
        mount.layer.style.top = `${-offset}px`;
        Object.assign(image.clip.style, {
          top: "0px", left: `${left - rect.left}px`, width: `${right - left}px`, height: `${height}px`,
          backgroundColor: global ? "transparent" : side === "left" ? "var(--dsw-specific-sidebar-fill)" : "var(--dsw-alias-bg-base)",
        });
        Object.assign(image.scene.style, {
          top: "0px", left: `${origin - left}px`, width: `${width}px`, height: `${body.height - borderTop - borderBottom + offset}px`,
        });
        sync(mount);
      }
    }
    for (const mount of images.keys()) if (!desired.has(mount)) remove(mount);
    setFrame(global ? frame : undefined);
    setProbe(global || images.size > 0);
    watch(elements);
  }

  function queue(): void {
    if (queued || disposed) return;
    queued = true;
    void Promise.resolve().then(() => { queued = false; refresh(); });
  }

  function animate(): void {
    animation = undefined;
    for (const element of transitions.keys()) if (!element.isConnected) transitions.delete(element);
    refresh();
    if (!disposed && transitions.size > 0) animation = window.requestAnimationFrame(animate);
  }

  function transition(event: Event): void {
    const target = event.target;
    const property = (event as TransitionEvent).propertyName;
    if (!(target instanceof window.Element) || !observed.has(target)
      || !["transform", "grid-template-columns", "width"].includes(property)) return;
    if (event.type === "transitionrun") {
      let properties = transitions.get(target);
      if (!properties) transitions.set(target, properties = new Set());
      properties.add(property);
      if (animation === undefined) animation = window.requestAnimationFrame(animate);
    } else {
      const properties = transitions.get(target);
      properties?.delete(property);
      if (properties?.size === 0) transitions.delete(target);
      queue();
    }
  }

  window.addEventListener("resize", queue);
  for (const name of ["transitionrun", "transitionend", "transitioncancel"]) document.addEventListener(name, transition, true);
  return {
    update(nextFullscreenHosts: HTMLElement[], nextSources: TitlebarSource[]) {
      fullscreenHosts = nextFullscreenHosts;
      sources = nextSources;
      refresh();
    },
    sync,
    remove,
    lostNode(node: Node): boolean {
      return [...images.values()].some((image) => image.clip === node && !image.clip.isConnected);
    },
    dispose() {
      disposed = true;
      resize?.disconnect();
      observed.clear();
      window.removeEventListener("resize", queue);
      for (const name of ["transitionrun", "transitionend", "transitioncancel"]) document.removeEventListener(name, transition, true);
      if (animation !== undefined) window.cancelAnimationFrame(animation);
      transitions.clear();
      for (const mount of images.keys()) remove(mount);
      setFrame(undefined);
      setProbe(false);
    },
  };
}
