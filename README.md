# dsh-background

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 与官方 Desktop 客户端分别设置全局、聊天和侧边栏背景。三个区域可以同时使用不同图片、轮播间隔和样式，会话列表沿用侧边栏背景。

项目仓库：[flora-ari/dsh-background](https://github.com/flora-ari/dsh-background)。

从 `v0.1.7` 起，安装包名为 `dsh-background-ari`，用于与市场中的其他同名背景插件区分。仓库名称、背景设置入口和客户端配置存储键保持原样。

## 安装

本仓库提供已编译的 `dist/`，安装时无需编译。包没有 `prepare`、`preinstall`、`install` 或 `postinstall` 脚本。

可从 [GitHub Releases](https://github.com/flora-ari/dsh-background/releases) 下载 `.tgz` 安装包，也可以将下面的下载地址填入 Desktop 的插件安装页面，或通过 Web CLI 安装：

```sh
dsh plugin --profile web add https://github.com/flora-ari/dsh-background/releases/download/v0.1.7/dsh-background-ari-0.1.7.tgz
```

### Web

使用已安装的 Harness CLI，把插件加入 Web profile：

```sh
dsh plugin --profile web add github:flora-ari/dsh-background#main
```

重启 Web 服务并刷新页面。迭代分支仅保留在本地，GitHub 安装使用 `#main`。

### Desktop

在 Desktop 侧边栏的 **Plugins / 插件** 页面安装，填写：

```text
github:flora-ari/dsh-background#main
```

也可以通过 Desktop 自带的 CLI 安装：先启动 Desktop 一次以初始化 profile，完全退出应用，再执行：

```sh
dsh plugin --profile desktop add github:flora-ari/dsh-background#main
```

随后重新打开 Desktop。这里必须使用 **Desktop 自带的命令**；通过 npm 安装的 CLI 不能修改 Desktop 保留的 profile。Web 与 Desktop 的插件安装分别生效。

### 从本插件旧版升级

如果已安装本仓库的 `v0.1.6` 或更早版本，其安装包名为 `dsh-background`。先在同一 profile 的插件页面移除这个旧包，再安装新版，以免两个副本同时运行。Web 端也可使用：

```sh
dsh plugin --profile web remove dsh-background
dsh plugin --profile web add https://github.com/flora-ari/dsh-background/releases/download/v0.1.7/dsh-background-ari-0.1.7.tgz
```

开发过程中如已安装临时包 `flora-ari-dsh-background`，也要在对应 profile 移除它；Web 端可执行 `dsh plugin --profile web remove flora-ari-dsh-background`，然后安装上面的新版安装包。

这里的移除步骤仅适用于本仓库的旧包；如安装的是其他作者的同名插件，请先核对来源。保持原客户端与服务地址时，原有背景配置保留。Desktop 用户通过其插件页面操作，或使用 Desktop 自带的 CLI，在应用完全退出后对 `desktop` profile 执行同样的替换，然后重新打开应用。

使用本地工作区链接开发时，改包名后先执行 `npm run build`，再完全退出 Desktop，使用其自带 CLI 移除旧包并重新安装工作区，最后重新打开应用。宿主首次加载包时会保存客户端产物快照；如果新包名对应的旧产物仍注册旧模块 ID，加载失败后的回退可能再次执行它，出现 `import failed` 或 `duplicate factory registration`。仅刷新页面不足以更新已运行宿主的快照，需要完整退出并用新构建重新启动。

### 本地构建与安装包

开发环境使用 Node.js 22.19 或以上版本。在项目目录执行：

```sh
npm install
npm run typecheck
npm run build
npm pack
```

完成上述构建后，`npm pack` 输出 `dsh-background-ari-0.1.7.tgz`。也可以用 `npm run package` 一次完成类型检查、构建与打包。在 Plugins 页面安装这个文件，或用 Web CLI 传入它的绝对路径（将下方占位路径替换为安装包的绝对路径）：

```sh
dsh plugin --profile web add "absolute\path\to\dsh-background-ari-0.1.7.tgz"
```

## 设置背景

点击主侧边栏的 **背景设置**，即可直接进入背景配置页面。入口排在自动化任务后面；侧边栏收起时仍可通过图标打开。设置弹窗内原有的 **背景 / Background** 入口也保留，两处均使用本项目的 [asset/icon.png](./asset/icon.png) 图标和同一份背景配置。

主页面中的背景设置表单在可用内容区域水平居中，长表单可以纵向滚动。

选择区域，启用背景并添加图片。点击保存后立即应用；关闭某个区域只关闭该区域的背景。

有背景显示时，Harness 内置设置弹窗也会透出已有背景，文字和按钮保持正常不透明度。弹窗打开期间，主区域的底层内容暂时隐藏，只保留背景图，避免两层文字重叠；关闭弹窗后恢复内容。关闭背景后，设置弹窗恢复原来的样式。

| 区域参数 | 应用位置 |
| --- | --- |
| `fullscreen` | 整个应用界面的底层背景，包括自动化任务页面 |
| `chat` | 聊天主区域，包括空会话与轨迹页面 |
| `sidebar` | 左侧导航、会话与工作区列表，以及右侧边栏 |

各区域独立配置；`fullscreen` 位于底层，聊天和侧边栏可以在它上面叠加自己的背景。图片的 `opacity` 只控制背景图片，文字和操作控件不会一起变透明。会话列表与侧边栏使用同一张背景，不再单独设置；显示侧边栏背景时，会话列表底部的分隔渐变也会移除。

轨迹页面优先使用已启用且有图片的 `chat` 背景；聊天背景关闭或图库为空时，沿用 `fullscreen` 背景。

自动化任务列表和详情区域默认沿用 `fullscreen` 的图片、轮播和样式，无需单独设置；聊天背景不影响该页面。搜索框、按钮、任务卡片和详情中的输入控件保留原有样式。全局背景关闭、图库为空或插件关闭时，页面恢复 Harness 原来的背景。

右侧边栏共用 `sidebar` 的图库，每次打开时独立随机选择初始图片，即使 `random` 为 `false` 也会随机选取。右侧与左侧的当前图片互不绑定；`interval` 大于 `0` 时，右侧按自己的计时器轮播，后续切换顺序由 `random` 决定。关闭右侧边栏会停止它的轮播，再次打开时重新选图。

在侧边栏设置中，左右两侧分别调整图片缩放和位置。右侧默认使用「高度铺满，宽度自适应」（`auto 100%`）和 `center`：图片高度随组件变化，宽度按原图比例缩放，不拉伸，也不会因面板变宽而裁掉上下构图。横向超出组件时裁切，宽度不足时两侧留白。修改左侧布局不会改变右侧布局，可点击「恢复右侧铺满」恢复默认。

所有区域的图片缩放方式均可直接选择「高度铺满，宽度自适应」或「宽度铺满，高度自适应」。也可选择等比例铺满、完整显示、按宽高铺满，或选择「自定义尺寸」填写 CSS 尺寸。

右侧面板的展开、收起、宽度和模式控制完全沿用 DeepSeek Harness 原版，插件只添加背景，不修改原版仓库或主动切换显示模式。普通侧栏保持与聊天区域并排；Harness 会记住此前选择的全屏模式。在较宽的窗口中，如果侧栏占满聊天区域，可点击侧栏内的「退出全屏」恢复并排。窗口较窄时，宿主会自行使用全屏布局。

Windows Desktop 顶部栏按照下方组件划分背景：左上与左侧边栏共用图片，中间使用 `fullscreen` 全局图片，右侧面板打开时右上与右侧共用当前图片。两侧图片将顶部栏与组件视为同一绘制区域，缩放、位置和轮播保持连续。顶部菜单和窗口按钮沿用宿主控件；关闭背景时恢复原来的顶部栏。此适配作用于宿主提供的 Windows 标题栏区域。

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

| 缩放选项 | `size` 值 | 行为 |
| --- | --- | --- |
| 高度铺满，宽度自适应 | `"auto 100%"` | 高度等于组件高度，宽度按比例缩放 |
| 宽度铺满，高度自适应 | `"100% auto"` | 宽度等于组件宽度，高度按比例缩放 |

这两种方式都保持图片比例；自动计算的另一边超出组件时会裁切，不足时会留白。

`sidebar.right` 单独设置右侧的 `size` 和 `position`，默认分别为 `"auto 100%"` 和 `"center"`，省略字段也使用这两个默认值。右侧使用它们作为布局参数；`sidebar.styles[i]` 的尺寸和位置仅影响左侧，不会覆盖右侧布局。右侧继续沿用侧边栏及单图样式的不透明度与模糊设置。例如，左侧完整显示、右侧高度铺满：

```json
{
  "sidebar": {
    "size": "contain",
    "position": "left top",
    "right": { "size": "auto 100%", "position": "center" }
  }
}
```

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

`main` 是开发主干。每次迭代可以使用 `v0.1.7` 这样的本地分支开发，完成验证后合并回 `main`，仅推送 `main`，不上传开发分支。发布前重新构建并提交 `dist/`，让 GitHub 安装使用与源码对应的产物。

测试代码统一放在本地 `tests/`。按本项目约定，`tests/`、`.agents/`、`.claude/` 以及其他运行时临时产物不上传到仓库，也不进入安装包；本地开发环境保留测试时，可执行 `npm test` 和 `npm run test:browser`。安装包通过 `files` 白名单仅包含构建产物、插件配置、图标、示例和文档。

## 兼容性

插件包格式、客户端工厂、设置页扩展和区域定位已按官方源码的 `dsh-v0.2.0-rc.2`（`639ed015397290b3745d163aafe02ffee4aa3f84`）及 `master` 的 `0.2.1-alpha.1` 源码（`5badb15009ae1756c3afe0ae0cef1faafc290ccc`）核对。官方 Desktop 使用同一套 Web 客户端，插件声明 `dsh.client.platform: "web"`。

`v0.1.1` 已通过类型检查、构建、28 项本地单元测试和 6 项 Chromium 浏览器测试。在隔离的官方 `@deepseek-ai/dsh@0.2.0-rc.2` Web profile 中，已验证侧边栏快捷入口与设置弹窗内原入口并存、两处保存后的配置同步、原 PNG 图标、收起侧栏的入口、三个区域配置与会话列表共用侧边栏背景，以及深色和浅色主题下的透明设置弹窗、底层文字隐藏与关闭后的恢复，无页面错误。自动化任务下方的位置通过官方入口排序契约验证。

`v0.1.2` 增加设置导航图标适配，已通过类型检查、构建、客户端注册定向测试，以及官方 Web 端的图标显示、关闭重开与配置保存验证。设置与侧栏图标均与原 `asset/icon.png` 字节一致。当前宿主没有设置导航图标扩展接口，适配仅作用于本插件的设置入口。

`v0.1.3` 增加轨迹背景继承和右侧边栏独立选图。32 项单元测试、7 项 Chromium 测试通过，后续结构底色调整也通过定向复测；官方 Web 端已实跑验证轨迹显示、右侧首次随机选图、关闭重开及原图标一致性。验证使用隔离的本地会话历史，没有调用模型。

另在 1360、1340、1000 和 700 像素窗口中对比背景关闭与开启状态，原生右侧面板、聊天区域及网格布局的尺寸和显示模式均一致。

`v0.1.5` 增加右侧独立缩放、位置、恢复高度铺满、两种按比例缩放预设及主设置页居中，52 项单元测试与 9 个 Chromium 用例通过。截图像素验证了高度铺满与宽度铺满均保持图片比例。官方 Web 端已验证左右布局互不影响、参数保存后关闭重开与刷新保留，以及不同高度窗口和原生分栏中的自适应效果；背景启停前后的右侧面板模式和尺寸一致。主设置页在宽屏和窄窗口中均水平居中，无横向溢出，长表单可滚动。

`v0.1.6` 让自动化任务列表与详情区域继承全局背景，已通过类型检查、构建、26 项相关单元测试与 4 个 Chromium 用例。浏览器用例覆盖详情结构背景、控件样式、全局轮播及关闭后的恢复。隔离的官方 Web profile 已实跑验证任务列表透出全局图片、搜索与筛选、切换页面、图片轮播，以及关闭全局背景、清空图库和关闭插件后的恢复；验证没有创建任务或调用模型。

`v0.1.7` 增加 Windows 顶部栏分段背景，63 项单元测试与 6 个 Chromium 用例通过，标题栏与两侧面板图片的连续性已在 Web 场景中用截图核对。官方 `0.2.0-rc.2` Desktop 已实机验证包名迁移后的启动与插件加载，只有一个运行实例，原有 `localStorage` 配置保留。

Windows 原生窗口按钮背景色尚无实机像素验证。Harness 的插件 API 尚未稳定，之后的版本可能需要适配。

## License

本项目采用 [MIT License](./LICENSE)。

## Acknowledgements

感谢 [shalldie/vscode-background](https://github.com/shalldie/vscode-background) 提供按区域设置背景、图片列表、轮播间隔、透明度及单张图片样式的设计参考。本项目根据 DeepSeek Harness 的插件接口独立实现，不复制其 VS Code 安装文件修改逻辑。
