# dsh-plugins

A monorepo of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugins by [@zousiquan](https://github.com/zousiquan). Each plugin lives in
`packages/<name>` and is an installable DSH bundle (`dsh.bundle`).

## Plugins

| Package | Description |
|---|---|
| [`dsh-ocr-translate`](packages/dsh-ocr-translate) | Left-sidebar panel: extract text from images with Tesseract OCR and translate it via the built-in translator. |
| [`dsh-personal-memory`](packages/dsh-personal-memory) | Minimal personal memory loop: schema-validated storage domain, memory_write/memory_search/memory_forget tools, and bounded automatic recall at session start. |

## Installing

Each plugin's README lists its prerequisites and config. Install via the DSH
**Plugins → Discover** tab by adding the plugin index published from this repo,
or **Plugins → Add plugin** pointing at a local `packages/<name>` directory.

- 索引 URL（GitHub Pages）：`https://zousiquan.github.io/dsh-plugins/index.json`
- 在 DSH「插件 → 发现 → 添加索引源」填入该 URL 即可浏览安装（需先启用实验性「自定义插件索引」组合包）。

---

## 开发与发布流程（中文）

### 单一来源原则

**代码只维护一份**：`packages/<插件名>/`。本地 DSH 安装通过链接指向这个目录
（`plugin_manager install_bundle <绝对路径>` 安装的是 link，不是拷贝），所以本地
安装和远程发布共用同一份文件——**不存在"本地改一份、远程改一份"的同步问题**。

工作区相关目录：

| 目录 | 作用 |
|---|---|
| `dsh-plugins/packages/<name>/` | 插件源码（唯一来源），git `main` 分支 |
| `dsh-plugins/`（仓库根） | monorepo git 仓库，remote = `git@github.com:zousiquan/dsh-plugins.git` |
| `market-site/` | 插件索引暂存目录，是一个独立 git 工作副本，分支 `gh-pages`，remote 同上；`index.json` + `icons/` 经 GitHub Pages 发布 |

### 一、日常改功能（不发版）

1. 直接改 `packages/<name>/` 里的文件。
2. 让本地安装生效：
   - **客户端 `client.js`**：刷新 GUI（⌘R）即可加载新代码。
   - **Host `index.js`**：需重载插件以加载新模块——`plugin_manager` 先 `remove_bundle`
     再 `install_bundle <绝对路径>`，或重启 DSH。
3. 跑回归测试（如 `test-host.mjs`）确认 Host 路由逻辑正常。

### 二、发布新版本（以 `dsh-ocr-translate` 升到 `1.0.1` 为例）

1. **升版本号**：改 `packages/dsh-ocr-translate/package.json` 的 `version` → `1.0.1`。
2. **提交并打标签**（monorepo 按包打标签 `<name>@X.Y.Z`）：
   ```sh
   cd dsh-plugins
   git add -A
   git commit -m "feat(dsh-ocr-translate): 1.0.1 — <改动摘要>"
   git tag -a dsh-ocr-translate@1.0.1 -m "dsh-ocr-translate 1.0.1"
   git push origin main
   git push origin dsh-ocr-translate@1.0.1
   ```
3. **取新提交的完整 SHA**（索引要用 40 位 SHA）：
   ```sh
   git rev-parse HEAD
   ```
4. **更新索引**：编辑 `market-site/index.json`，在对应插件的 `versions` 数组**追加**一条：
   ```json
   {
     "version": "1.0.1",
     "publishTimestamp": 1795150000,
     "source": {
       "type": "git",
       "url": "https://github.com/zousiquan/dsh-plugins.git",
       "commit": "<上一步的完整 SHA>",
       "path": "packages/dsh-ocr-translate"
     },
     "engines": { "dsh": ">=0.2.2-rc.5" }
   }
   ```
   `publishTimestamp` 用当前 Unix 秒（`date +%s`）。保留旧版本条目，DSH 会自动推荐
   兼容的最高非预发布版本。
5. **推送索引到 gh-pages**：
   ```sh
   cd market-site
   git add index.json
   git commit -m "publish dsh-ocr-translate 1.0.1"
   git push origin gh-pages
   ```
6. **验证**：等约 1 分钟 Pages 部署，确认
   `https://zousiquan.github.io/dsh-plugins/index.json` 返回 200 且含新版本；
   用 `plugin_market` 工具 `list_plugins`（target 为索引 URL）确认新版本
   `compatibility.compatible: true`。

### 三、新增一个插件

1. 建 `packages/<new-name>/`，至少包含：
   - `package.json`：`name`（**非 private**、可发布名）、`version`、`engines.dsh`、
     `dsh.bundle.patch`、`dsh.client`（如有浏览器半）、`exports`/`files`、
     `repository.directory` 指向 `packages/<new-name>`。
   - `cordis.patch.yml`：`insert` 一行，`name` 等于包名。
   - Host `index.js`（`export function apply(ctx, config)`）、可选 Client `client.js`
     （`window.__ModuleLoader__.load({ id: '<包名>', factory })`，id 必须等于包名）。
   - `locale/en.json` + `locale/zh.json`（`meta.title`/`meta.description`）、原创 `icon.svg`、`README.md`。
2. **本地安装验证**：`plugin_manager install_bundle <packages/new-name 绝对路径>`，
   确认 `application: applied`，在 GUI 验证功能。
3. **提交 + 打标签 + 推送**：`git tag -a <new-name>@1.0.0 ...`，`git push origin main --tags`。
4. **索引追加插件**：在 `market-site/index.json` 的 `plugins` 数组追加一条（含
   `name`/`title`/`description`/`icon`/`author`/`repository`/`versions`，git 来源
   `path` 指向 `packages/<new-name>`），并把图标放到 `market-site/icons/`，推送 `gh-pages`。

### 四、注意事项

- **标签格式**：monorepo 多包用 `<name>@X.Y.Z`（如 `dsh-ocr-translate@1.0.1`）。
- **索引 git 来源**：`source.commit` 必须是 40 位完整 SHA；`path` 指向包子目录；
  `url` 用 `https://github.com/zousiquan/dsh-plugins.git`。
- **engines.dsh**：要与实际测试过的 DSH 版本一致（当前 `>=0.2.2-rc.5`）；DSH 安装时会再校验。
- **共享服务行冲突**：若 `cordis.patch.yml` 插入了共享服务行（如 `dsh-ocr-translate`
  插入 experimental `translator`，id 固定为 `translator`），与其他 bundle 的同 id 行会冲突；
  发布说明里要注明，必要时改为可选依赖。
- **外部依赖**：`dsh-ocr-translate` 的 OCR 依赖本机 Tesseract + `chi_sim` 语言数据，
  插件不内置二进制；索引描述与 README 已写明安装前提。
- **GitHub Pages**：仓库 Settings → Pages → Source 选 "Deploy from a branch"，
  分支 `gh-pages`、目录 `/ (root)`。索引与图标经此发布。
- **索引校验（可选）**：可用 DSH 自带 `@deepseek-ai/dsh-plugin-market-index` 的
  `parseMarketIndex(value, indexUrl)` 在发布前校验 `index.json` 格式。

## License

Each package declares its own license (see the package directory).