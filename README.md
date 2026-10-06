# dsh-background

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 与官方 Desktop 客户端分别设置全局、聊天和侧边栏背景。三个区域可以同时使用不同图片、轮播间隔和样式，会话列表沿用侧边栏背景。

项目仓库：[aiirudi/dsh-background](https://github.com/aiirudi/dsh-background)。

## 安装

本仓库提供已编译的 `dist/`，安装时无需编译。包没有 `prepare`、`preinstall`、`install` 或 `postinstall` 脚本。

### Web

使用已安装的 Harness CLI，把插件加入 Web profile：

```sh
dsh plugin --profile web add github:aiirudi/dsh-background#main
```

重启 Web 服务并刷新页面。迭代分支仅保留在本地，GitHub 安装使用 `#main`。

### Desktop

在 Desktop 侧边栏的 **Plugins / 插件** 页面安装，填写：

```text
github:aiirudi/dsh-background#main
```

也可以通过 Desktop 自带的 CLI 安装：先启动 Desktop 一次以初始化 profile，完全退出应用，再执行：

```sh
dsh plugin --profile desktop add github:aiirudi/dsh-background#main
```

随后重新打开 Desktop。这里必须使用 **Desktop 自带的命令**；通过 npm 安装的 CLI 不能修改 Desktop 保留的 profile。Web 与 Desktop 的插件安装分别生效。

### 本地构建与安装包

开发环境使用 Node.js 22.19 或以上版本。在项目目录执行：

```sh
npm install
npm run typecheck
npm run build
npm pack
```

完成上述构建后，`npm pack` 输出 `dsh-background-0.1.2.tgz`。也可以用 `npm run package` 一次完成类型检查、构建与打包。在 Plugins 页面安装这个文件，或用 Web CLI 传入它的绝对路径，例如：

```sh
dsh plugin --profile web add "E:\Work\LLM_application\dsh-background\dsh-background-0.1.2.tgz"
```

## 设置背景

点击主侧边栏的 **背景设置**，即可直接进入背景配置页面。入口排在自动化任务后面；侧边栏收起时仍可通过图标打开。设置弹窗内原有的 **背景 / Background** 入口也保留，两处均使用本项目的 [asset/icon.png](./asset/icon.png) 图标和同一份背景配置。

选择区域，启用背景并添加图片。点击保存后立即应用；关闭某个区域只关闭该区域的背景。

有背景显示时，Harness 内置设置弹窗也会透出已有背景，文字和按钮保持正常不透明度。弹窗打开期间，主区域的底层内容暂时隐藏，只保留背景图，避免两层文字重叠；关闭弹窗后恢复内容。关闭背景后，设置弹窗恢复原来的样式。

| 区域参数 | 应用位置 |
| --- | --- |
| `fullscreen` | 整个应用界面的底层背景 |
| `chat` | 聊天主区域，包括空会话页面 |
| `sidebar` | 整个左侧导航栏，包括会话与工作区列表 |

各区域独立配置；`fullscreen` 位于底层，聊天和侧边栏可以在它上面叠加自己的背景。图片的 `opacity` 只控制背景图片，文字和操作控件不会一起变透明。会话列表与侧边栏使用同一张背景，不再单独设置；显示侧边栏背景时，会话列表底部的分隔渐变也会移除。

旧版配置中的 `sessionList` 会被忽略，已有的 `fullscreen`、`chat` 和 `sidebar` 配置保持可用。保存或导出后，配置只包含这三个区域。

首次安装默认不显示图片：顶层与三个区域的 `enabled` 均为 `true`，图片列表为空。添加图片并保存后即可显示。

### 参数

顶层 `enabled` 是整个插件的开关。以下参数在三个区域内分别设置：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用该区域背景 |
| `images` | `[]` | 图片地址列表；为空时不显示背景 |
| `interval` | `0` | 轮播间隔，单位为秒；`0` 停止轮播；最大为 `2147483.647` |
| `random` | `false` | `false` 按图片列表顺序播放，`true` 随机切换 |
| `opacity` | `0.3` | 图片不透明度，范围 `0–1` |
| `size` | `"cover"` | 图片缩放，支持 `cover`、`contain`、`auto`、百分比或 CSS 长度，例如 `"100% auto"` |
| `position` | `"center"` | 图片位置，例如 `"right bottom"`、`"50% 30%"` |
| `blur` | `0` | 图片模糊半径，单位为像素，非负数 |
| `transition` | `0.5` | 图片切换的渐变时长，单位为秒，非负数 |
| `styles` | `[]` | 与 `images` 按索引对应的单张图片样式覆盖 |

`styles[i]` 可以覆盖第 `i` 张图片的 `opacity`、`size`、`position` 和 `blur`。未填写的字段继承该区域的设置；样式项数不能超过图片数量。它是受限的视觉参数，不接受任意 CSS。

配置支持省略字段，省略的字段使用默认值。拼错参数名或填写非法值时，设置页面会显示错误，保存前的配置继续生效。

### 配置示例

设置页面提供 JSON 编辑、导入和导出。下面展示聊天区域每 20 秒切换一次图片，并为第二张图片覆盖透明度、位置和模糊程度：

```json
{
  "enabled": true,
  "chat": {
    "enabled": false,
    "images": [
      "https://images.example.com/chat-01.jpg",
      "https://images.example.com/chat-02.jpg"
    ],
    "interval": 20,
    "random": false,
    "opacity": 0.3,
    "size": "cover",
    "position": "center",
    "styles": [
      {},
      { "opacity": 0.2, "position": "right bottom", "blur": 2 }
    ]
  }
}
```

示例中的域名和图片路径是占位地址。先替换为自己的图片，再把区域 `enabled` 改为 `true`。完整的三区域配置见 [examples/background.json](./examples/background.json)，同样默认关闭占位图片。

JSON 是本插件设置页面使用的配置格式；背景设置保存在客户端，不通过 `cordis.patch.yml` 的 Host `config` 设置。

## 图片与配置保存

可以添加 `http://`、`https://` 图片地址，或通过设置页面上传本地图片。本地上传会转换为 `data:image` 地址并随配置保存，因此两端都不需要直接读取本地文件路径。`file://`、本地绝对路径和相对文件路径不能直接填入 `images`。

远程图片必须能由当前客户端访问。HTTPS 页面使用 HTTP 图片时可能被浏览器的混合内容策略阻止；建议使用 HTTPS 图片。需要登录、阻止外链或失效的图片地址也可能无法显示。

配置保存于当前客户端的 `localStorage`，以页面 origin 分隔。不同浏览器、不同 Web 服务地址及 Desktop 的配置独立，默认不会跨端同步。需要迁移时，在一个客户端导出 JSON，再在另一个客户端导入。

本地图片也占用浏览器存储空间。图片过大或过多导致存储额度不足时，设置页面会显示保存失败，旧配置继续保留。可以缩小图片、减少数量或使用远程图片地址。

## 开发约定

`main` 是开发主干。每次迭代可以使用 `v0.1.2` 这样的本地分支开发，完成验证后合并回 `main`，仅推送 `main`，不上传开发分支。发布前重新构建并提交 `dist/`，让 GitHub 安装使用与源码对应的产物。

测试代码统一放在本地 `tests/`。按本项目约定，`tests/`、`.agents/`、`.claude/` 以及其他运行时临时产物不上传到仓库，也不进入安装包；本地开发环境保留测试时，可执行 `npm test` 和 `npm run test:browser`。安装包通过 `files` 白名单仅包含构建产物、插件配置、图标、示例和文档。

## 兼容性

插件包格式、客户端工厂、设置页扩展和区域定位已按官方源码的 `dsh-v0.2.0-rc.2`（`639ed015397290b3745d163aafe02ffee4aa3f84`）及 `master` 的 `0.2.1-alpha.1` 源码（`5badb15009ae1756c3afe0ae0cef1faafc290ccc`）核对。官方 Desktop 使用同一套 Web 客户端，插件声明 `dsh.client.platform: "web"`。

`v0.1.1` 已通过类型检查、构建、28 项本地单元测试和 6 项 Chromium 浏览器测试。在隔离的官方 `@deepseek-ai/dsh@0.2.0-rc.2` Web profile 中，已验证侧边栏快捷入口与设置弹窗内原入口并存、两处保存后的配置同步、原 PNG 图标、收起侧栏的入口、三个区域配置与会话列表共用侧边栏背景，以及深色和浅色主题下的透明设置弹窗、底层文字隐藏与关闭后的恢复，无页面错误。自动化任务下方的位置通过官方入口排序契约验证。

`v0.1.2` 增加设置导航图标适配，已通过类型检查、构建、客户端注册定向测试，以及官方 Web 端的图标显示、关闭重开与配置保存验证。设置与侧栏图标均与原 `asset/icon.png` 字节一致。当前宿主没有设置导航图标扩展接口，适配仅作用于本插件的设置入口。

Desktop 的适配依据其共用 Web 客户端与官方插件接口；尚未在 Electron Desktop 中实机验证。Harness 的插件 API 尚未稳定，之后的版本可能需要适配。

## License

本项目采用 [MIT License](./LICENSE)。

## Acknowledgements

感谢 [shalldie/vscode-background](https://github.com/shalldie/vscode-background) 提供按区域设置背景、图片列表、轮播间隔、透明度及单张图片样式的设计参考。本项目根据 DeepSeek Harness 的插件接口独立实现，不复制其 VS Code 安装文件修改逻辑。
