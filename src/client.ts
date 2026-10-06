import backgroundIcon from '../asset/icon.png';
import { mountBackgrounds } from './renderer.js';
import { createSettingsPanel } from './settings.js';
import { mountSettingsIcon } from './settings-icon.js';
import { createConfigStore } from './storage.js';

/** Small structural faces of the Host's shared React and Cordis services. */
interface ReactFace {
  createElement(type: string, props: Record<string, unknown>): object;
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]): void;
}

/** Runtime icon props owned by the Host's sidebar.panellist row. */
interface SidebarPanelIconProps {
  size: number;
  active: boolean;
}

interface ClientContext {
  effect(effect: () => (() => void), label?: string): (() => void);
  slots: {
    inject(name: 'main' | 'sidebar.panellist' | 'settings.section', effect: () => (() => void)): (() => void);
    register(options: {
      name: 'main';
      key: string;
    }, component: () => object): (() => void);
    register(options: {
      name: 'sidebar.panellist';
      id: string;
      order: number;
      label: string;
    }, component: (props: SidebarPanelIconProps) => object): (() => void);
    register(options: {
      name: 'settings.section';
      id: string;
      order: number;
      label: string;
    }, component: () => object): (() => void);
  };
}

interface ClientPlugin {
  inject: string[];
  apply(ctx: ClientContext): void;
}

declare global {
  interface Window {
    __ModuleLoader__: {
      load(module: {
        id: string;
        factory(require: (specifier: 'react') => ReactFace): ClientPlugin;
      }): void;
    };
  }
}

// Register a lazy factory: the shared client Loader owns materialization,
// dependency waiting, and disposal in both the Web and Desktop applications.
window.__ModuleLoader__.load({
  id: 'dsh-background-ari',
  factory(require) {
    const React = require('react');
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const store = createConfigStore(window);
          const renderer = mountBackgrounds(document, store.load().config);
          const unsubscribe = store.subscribe(config => renderer.update(config));
          const disposeSettingsIcon = mountSettingsIcon(document, backgroundIcon);

          function BackgroundIcon({ size }: SidebarPanelIconProps) {
            return React.createElement('img', {
              src: backgroundIcon,
              alt: '',
              'aria-hidden': true,
              draggable: false,
              width: size,
              height: size,
              style: { display: 'block', objectFit: 'contain' },
            });
          }

          function useBackgroundSettingsContainer() {
            const container = React.useRef<HTMLElement | null>(null);
            React.useEffect(() => {
              const parent = container.current;
              if (!parent) return;
              let panel: HTMLElement | undefined;
              let saving = false;
              const renderPanel = () => {
                const selectedRegion = panel
                  ?.querySelector<HTMLButtonElement>('button[data-region][aria-pressed="true"]')
                  ?.dataset.region;
                const saved = store.load();
                const next = createSettingsPanel(document, saved.config, config => {
                  // This panel keeps its selected region and save feedback;
                  // other mounted entry points refresh from the shared store.
                  saving = true;
                  try { store.save(config); }
                  finally { saving = false; }
                });
                if (selectedRegion) {
                  const selectedTab = Array.from(next.querySelectorAll<HTMLButtonElement>('button[data-region]'))
                    .find(button => button.dataset.region === selectedRegion);
                  selectedTab?.click();
                }
                if (saved.error) {
                  const notice = document.createElement('p');
                  notice.setAttribute('role', 'alert');
                  notice.textContent = saved.error;
                  next.prepend(notice);
                }
                if (panel) panel.replaceWith(next);
                else parent.append(next);
                panel = next;
              };
              renderPanel();
              const unsubscribePanel = store.subscribe(() => {
                if (!saving) renderPanel();
              });
              return () => {
                unsubscribePanel();
                panel?.remove();
              };
            }, []);
            return container;
          }

          function BackgroundSettings() {
            const container = useBackgroundSettingsContainer();
            return React.createElement('div', {
              ref: container,
              style: { height: '100%', minHeight: 0, overflow: 'auto' },
              'data-dsh-background-settings': '',
            });
          }

          function BackgroundPage() {
            const container = useBackgroundSettingsContainer();
            return React.createElement('div', {
              ref: container,
              style: {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                height: '100%', minHeight: 0, minWidth: 0, overflow: 'auto',
                boxSizing: 'border-box', padding: '24px',
                paddingTop: document.documentElement.dataset.platform === 'darwin'
                  ? 'calc(24px + var(--dsh-frame-top-clearance, 0px))'
                  : '24px',
              },
              'data-dsh-background-settings': '',
            });
          }

          // The sidebar owns navigation, selection, and wide/rail geometry.
          // Its list id addresses the matching key in the root main slot.
          const unregisterMain = ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: 'dsh-background',
          }, BackgroundPage));
          const unregisterSidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'dsh-background',
            order: 20,
            label: '背景设置',
          }, BackgroundIcon));
          const unregisterSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-background',
            order: 35,
            label: '背景 / Background',
          }, BackgroundSettings));

          return () => {
            disposeSettingsIcon();
            unregisterSettings();
            unregisterSidebar();
            unregisterMain();
            unsubscribe();
            renderer.dispose();
            store.dispose();
          };
        }, 'dsh-background: preferences, surfaces, background page, and settings');
      },
    };
  },
});
