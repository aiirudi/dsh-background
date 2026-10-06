import { mountBackgrounds } from './renderer.js';
import { createSettingsPanel } from './settings.js';
import { createConfigStore } from './storage.js';

/** Small structural faces of the Host's shared React and Cordis services. */
interface ReactFace {
  createElement(type: string, props: Record<string, unknown>): object;
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]): void;
}

interface ClientContext {
  effect(effect: () => (() => void), label?: string): (() => void);
  slots: {
    inject(name: string, effect: () => (() => void)): (() => void);
    register(options: {
      name: string;
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
  id: 'dsh-background',
  factory(require) {
    const React = require('react');
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const store = createConfigStore(window);
          const renderer = mountBackgrounds(document, store.load().config);
          const unsubscribe = store.subscribe(config => renderer.update(config));

          function BackgroundSettings() {
            const container = React.useRef<HTMLElement | null>(null);
            React.useEffect(() => {
              const parent = container.current;
              if (!parent) return;
              const saved = store.load();
              const panel = createSettingsPanel(document, saved.config, config => store.save(config));
              if (saved.error) {
                const notice = document.createElement('p');
                notice.setAttribute('role', 'alert');
                notice.textContent = saved.error;
                panel.prepend(notice);
              }
              parent.append(panel);
              return () => panel.remove();
            }, []);
            return React.createElement('div', {
              ref: container,
              style: { height: '100%', minHeight: 0, overflow: 'auto' },
              'data-dsh-background-settings': '',
            });
          }

          const unregister = ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-background',
            order: 35,
            label: '背景 / Background',
          }, BackgroundSettings));

          return () => {
            unregister();
            unsubscribe();
            renderer.dispose();
            store.dispose();
          };
        }, 'dsh-background: preferences, surfaces, and settings');
      },
    };
  },
});
