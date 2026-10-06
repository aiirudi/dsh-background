import { createDefaultConfig, normalizeConfig } from './config.js';
import type { BackgroundConfig } from './config.js';

export const STORAGE_KEY = 'dsh-background.config.v1';

/** Browser-owned preferences work in both Web and the Desktop WebView. */
export function createConfigStore(window: Window) {
  let current = createDefaultConfig();
  let error: string | undefined;
  const listeners = new Set<(config: BackgroundConfig) => void>();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) current = normalizeConfig(JSON.parse(saved));
  } catch (cause) {
    error = `无法读取已保存的背景配置：${cause instanceof Error ? cause.message : String(cause)}。当前使用默认配置，可在此重新保存。`;
  }
  function notify() {
    for (const listener of listeners) listener(normalizeConfig(current));
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    try {
      current = event.newValue === null ? createDefaultConfig() : normalizeConfig(JSON.parse(event.newValue));
      error = undefined;
      notify();
    } catch {
      // An invalid write from another window must not replace the running config.
    }
  }
  window.addEventListener('storage', onStorage);
  return {
    load(): { config: BackgroundConfig; error?: string } {
      return { config: normalizeConfig(current), ...(error ? { error } : {}) };
    },
    save(input: BackgroundConfig) {
      const next = normalizeConfig(input);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (cause) {
        throw new Error(`背景配置保存失败，请减少导入图片的大小或数量：${cause instanceof Error ? cause.message : String(cause)}`);
      }
      current = next;
      error = undefined;
      notify();
    },
    subscribe(listener: (config: BackgroundConfig) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      window.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
