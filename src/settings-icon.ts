const SETTINGS_LABEL = '背景 / Background';
const ICON_ATTRIBUTE = 'data-dsh-background-settings-icon';
const NAV_SELECTOR = '[data-shortcut-modal="settings"] nav';

/** Adapt our settings row while the Host's shell has no nav-icon slot. */
export function mountSettingsIcon(document: Document, source: string): () => void {
  const Observer = document.defaultView?.MutationObserver;
  if (!Observer) return () => {};

  const style = document.createElement('style');
  style.setAttribute('data-dsh-background-settings-icon-style', '');
  style.textContent = `${NAV_SELECTOR} button > img[${ICON_ATTRIBUTE}] + svg { display: none !important; }`;
  document.head.append(style);
  const icons = new Set<HTMLImageElement>();

  function sync() {
    for (const image of icons) {
      if (!image.isConnected) icons.delete(image);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(`${NAV_SELECTOR} button`)) {
      if (button.textContent?.trim() !== SETTINGS_LABEL) continue;
      if (button.querySelector(`:scope > img[${ICON_ATTRIBUTE}]`)) continue;
      const original = button.querySelector<SVGSVGElement>(':scope > svg');
      if (!original) continue;

      const image = document.createElement('img');
      image.setAttribute(ICON_ATTRIBUTE, '');
      image.src = source;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.draggable = false;
      image.width = Number(original.getAttribute('width')) || 16;
      image.height = Number(original.getAttribute('height')) || 16;
      image.style.cssText = 'display:block;flex:none;object-fit:contain';
      // Keep React's SVG intact. The adjacent-sibling rule hides it only
      // while our own image is present, so disposal restores the gear.
      original.before(image);
      icons.add(image);
    }
  }

  sync();
  const observer = new Observer(sync);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    for (const image of icons) image.remove();
    icons.clear();
    style.remove();
  };
}
