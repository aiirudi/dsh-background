import { createDefaultConfig, normalizeConfig, REGION_NAMES } from './config.js';
import type { BackgroundConfig, RegionName } from './config.js';

const LABELS: Record<RegionName, string> = {
  fullscreen: '全局背景', chat: '聊天区域', sidebar: '侧边栏',
};

const CSS = `
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

function readFile(document: Document, file: File, asDataUrl: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const Reader = document.defaultView?.FileReader;
    if (!Reader) return reject(new Error('当前环境不支持文件导入。'));
    const reader = new Reader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    if (asDataUrl) reader.readAsDataURL(file); else reader.readAsText(file);
  });
}

/** Native controls are wrapped in the host's React settings slot. */
export function createSettingsPanel(
  document: Document,
  initialConfig: BackgroundConfig,
  onSave: (config: BackgroundConfig) => void,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'dsh-bg-settings';
  root.setAttribute('aria-label', '背景设置');
  let draft = normalizeConfig(initialConfig);
  let selected: RegionName = 'chat';
  let status: HTMLElement;
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function message(text: string, isError = false) {
    status.textContent = text;
    status.dataset.error = String(isError);
  }
  function action(text: string, handler: () => void, primary = false) {
    const button = el('button', text);
    button.type = 'button';
    if (primary) button.className = 'bg-primary';
    button.addEventListener('click', handler);
    return button;
  }
  function check(text: string, value: boolean, onChange: (value: boolean) => void) {
    const label = el('label'); label.className = 'bg-check';
    const input = el('input'); input.type = 'checkbox'; input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, document.createTextNode(text));
    return label;
  }
  function render() {
    root.replaceChildren();
    const style = el('style', CSS);
    root.append(style, el('h2', '背景设置'), el('p', '为全局、聊天和侧边栏分别设置图片与轮播。会话列表沿用侧边栏背景。'));
    root.append(check('启用背景插件', draft.enabled, value => { draft.enabled = value; }));
    const tabs = el('div'); tabs.className = 'bg-tabs'; tabs.setAttribute('aria-label', '背景区域');
    for (const region of REGION_NAMES) {
      const button = action(LABELS[region], () => { selected = region; render(); });
      button.setAttribute('aria-pressed', String(selected === region));
      button.dataset.region = region;
      tabs.append(button);
    }
    root.append(tabs);
    const config = draft[selected];
    const card = el('div'); card.className = 'bg-card';
    card.append(el('h3', `${LABELS[selected]} · ${selected}`));
    card.append(check('启用此区域', config.enabled, value => { config.enabled = value; }));
    const grid = el('div'); grid.className = 'bg-grid';
    function field(text: string, name: string, input: HTMLInputElement | HTMLSelectElement) {
      const label = el('label'); label.className = 'bg-field'; input.name = name;
      label.append(el('span', text), input); grid.append(label);
    }
    for (const [key, label, min, max, step] of [
      ['opacity', '图片不透明度（0–1）', 0, 1, 0.05],
      ['interval', '轮播间隔（秒，0 表示停止）', 0, undefined, 1],
      ['blur', '模糊程度（像素）', 0, undefined, 1],
      ['transition', '切换过渡（秒）', 0, undefined, 0.1],
    ] as const) {
      const input = el('input'); input.type = 'number'; input.value = String(config[key]);
      input.min = String(min); if (max !== undefined) input.max = String(max); input.step = String(step);
      input.addEventListener('input', () => { config[key] = input.value === '' ? NaN : Number(input.value); });
      field(label, key, input);
    }
    const size = el('input'); size.type = 'text'; size.value = config.size; size.placeholder = 'cover / contain / 100% auto';
    size.addEventListener('input', () => { config.size = size.value; }); field('图片缩放方式', 'size', size);
    const position = el('input'); position.type = 'text'; position.value = config.position; position.placeholder = 'center / right bottom';
    position.addEventListener('input', () => { config.position = position.value; }); field('图片位置', 'position', position);
    card.append(grid, check('随机播放', config.random, value => { config.random = value; }));
    const images = el('div'); images.className = 'bg-card'; images.append(el('h3', `图片列表（${config.images.length}）`));
    const hint = el('p', '支持 HTTP(S) 图片地址或导入本地图片。本地图片保存在当前浏览器或桌面端；建议使用压缩后的图片。'); hint.className = 'bg-muted'; images.append(hint);
    const row = el('div'); row.className = 'bg-url';
    const url = el('input'); url.type = 'url'; url.placeholder = 'https://example.com/background.jpg'; url.setAttribute('aria-label', '图片地址');
    row.append(url, action('添加图片地址', () => {
      try {
        if (!url.value.trim()) throw new Error('请输入图片地址。');
        const next = normalizeConfig({ ...draft, [selected]: { ...config, images: [...config.images, url.value.trim()] } });
        draft = next; render(); message('图片已添加，保存后生效。');
      } catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    })); images.append(row);
    const uploadLabel = el('label'); uploadLabel.className = 'bg-field'; uploadLabel.append(el('span', '导入本地图片'));
    const upload = el('input'); upload.type = 'file'; upload.accept = 'image/*'; upload.multiple = true;
    upload.addEventListener('change', async () => {
      const files = Array.from(upload.files ?? []); if (!files.length) return;
      const region = selected;
      try {
        const sources = await Promise.all(files.map(file => {
          if (!file.type.startsWith('image/')) throw new Error(`${file.name} 不是图片文件。`);
          return readFile(document, file, true);
        }));
        draft = normalizeConfig({ ...draft, [region]: { ...draft[region], images: [...draft[region].images, ...sources] } });
        render(); message(`已导入 ${sources.length} 张图片，保存后生效。`);
      } catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    }); uploadLabel.append(upload); images.append(uploadLabel);
    config.images.forEach((source, index) => {
      const imageRow = el('div'); imageRow.className = 'bg-image';
      const image = el('img'); image.src = source; image.alt = `${LABELS[selected]}图片 ${index + 1}`;
      const title = el('span', source.startsWith('data:') ? `本地图片 ${index + 1}` : source); title.title = source.startsWith('data:') ? '导入的本地图片' : source;
      imageRow.append(image, title, action('移除', () => { config.images.splice(index, 1); config.styles.splice(index, 1); render(); })); images.append(imageRow);
    });
    root.append(card, images);
    const actions = el('div'); actions.className = 'bg-actions';
    actions.append(action('保存并应用', () => {
      try { const next = normalizeConfig(draft); onSave(next); draft = next; render(); message('背景配置已保存并应用。'); }
      catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    }, true), action('恢复默认配置', () => { draft = createDefaultConfig(); render(); message('已恢复默认配置，保存后生效。'); }));
    root.append(actions);
    const advanced = el('details'); advanced.append(el('summary', '高级参数 JSON / 导入导出'));
    const json = el('textarea'); json.setAttribute('aria-label', '背景配置 JSON'); json.spellcheck = false;
    json.value = JSON.stringify(draft, null, 2);
    advanced.addEventListener('toggle', () => { if (advanced.open) json.value = JSON.stringify(draft, null, 2); });
    const advancedActions = el('div'); advancedActions.className = 'bg-actions';
    advancedActions.append(action('载入 JSON', () => {
      try { draft = normalizeConfig(JSON.parse(json.value)); render(); message('JSON 已载入，保存后生效。'); }
      catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    }), action('导出配置', () => {
      try {
        const next = normalizeConfig(draft);
        const link = el('a'); link.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(next, null, 2))}`;
        link.download = 'dsh-background.json'; link.click(); message('配置已导出。');
      } catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    }));
    const importLabel = el('label'); importLabel.className = 'bg-field'; importLabel.append(el('span', '导入配置 JSON'));
    const importFile = el('input'); importFile.type = 'file'; importFile.accept = '.json,application/json';
    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0]; if (!file) return;
      try { draft = normalizeConfig(JSON.parse(await readFile(document, file, false))); render(); message('配置已导入，保存后生效。'); }
      catch (cause) { message(cause instanceof Error ? cause.message : String(cause), true); }
    }); importLabel.append(importFile);
    const advancedHint = el('p', '使用 fullscreen、chat、sidebar 参数配置各区域。styles[i] 可覆盖第 i 张图片的 opacity、size、position 和 blur。'); advancedHint.className = 'bg-muted';
    advanced.append(advancedHint, json, advancedActions, importLabel); root.append(advanced);
    status = el('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
  }
  render();
  return root;
}
