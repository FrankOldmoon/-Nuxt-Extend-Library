# 私人图书馆 · Nuxt Library Module

> 一个可插拔的 **Nuxt 4 Layer 模块**，把一台服务器变成一座私有的电子图书馆：上传、整理元数据、在线阅读、划线批注、全文搜索、朗读与格式转换。

它借鉴 [talebook](https://github.com/talebook/talebook) 的产品形态，但实现上遵循三个克制的前提：

- **不引入第三方依赖**。EPUB/OPF 解析、ZIP 读写、分页排版、原生格式转换全部在模块内实现，因此它可以在一个裸 Node 进程里跑起来，也不会给宿主带来任何新包。
- **只做私有的书库**。电子书文件**不经过**宿主的公开文件路由，只能通过模块自己的鉴权接口下载，避免书籍被外部索引到。
- **复用而不重写宿主能力**。账号、权限、配置、文件存储都沿用宿主已有的机制，模块只通过少量约定好的"接缝"接入。

---

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [数据模型](#数据模型)
- [接口一览](#接口一览)
- [阅读器](#阅读器)
- [划线高亮与笔记](#划线高亮与笔记)
- [格式转换](#格式转换)
- [内置教程书](#内置教程书)
- [配置项](#配置项)
- [对宿主的依赖（接入契约）](#对宿主的依赖接入契约)
- [开发](#开发)
- [已知限制](#已知限制)
- [许可](#许可)

---

## 特性

### 目录与整理
- 一本书可以有多个文件（EPUB + PDF 并存），阅读时优先选 EPUB；文件在磁盘上丢失时会被标记为"缺失"并支持**补充文件**而不丢失进度与批注。
- 分类（扁平列表，含图标与排序）／标签（自由关键词）／书单（人工合集）三层组织；作者、系列（含卷次）、出版社是独立数据表，因此能自动聚合作者页、让系列按卷次排序。
- 血缘清晰的**所有权权限模型**：公开书籍所有登录用户可读，私有书籍只有所有者与管理员可读，修改与删除永远只限所有者与管理员。

### 元数据
- 上传时从 EPUB 内部提取标题、作者、简介、标签、ISBN、语言、出版社、出版日期、系列与封面；读不到时从文件名（`三体 - 刘慈欣.epub`）推断。
- **豆瓣元数据**搜索与抓取，支持 ISBN 精确检索；抓取结果只填入表单，**必须点击保存才写库**；封面下载到本地存储而不是留外链。
- 出站请求带 **SSRF 防护**（DNS 解析 + 私网/保留地址拦截），避免被当作探测内网的工具。

### 阅读与批注
- EPUB 2/3 阅读器：**分页 / 双页 / 滚动**三种版面，字号、行距、页宽、三种主题（明亮 / 护眼 / 暗色）、全屏、目录、书签、进度同步。
- **划线高亮**：6 种颜色 × 6 种线型（底色高亮 + 单/双/点/虚/波浪下划线），可为任意划线**输入笔记**。
- **书内全文搜索**：CJK 友好的索引方案，缺失索引时按需重建。
- **朗读**：Web Speech API，句级切分、逐句高亮跟随、自动续读下一章。
- 键盘 `←` `→`、滚轮、触控板左右滑动与触屏滑动翻页。

### 维护
- **软删除 + 回收站**：删除进回收站，可恢复（连同文件、封面、批注与进度），管理员可彻底删除。
- 批量删除 / 恢复为"尽力而为"语义：无权限的书被跳过并回报，而不是让整批失败。
- 原生格式转换，以及可选的外部 Calibre 支持。
- 内置**使用教程 EPUB**：新装环境自动种下，作为唯一的初始书籍。
- 界面文案支持 **English / 简体中文 / 繁體中文**。

---

## 快速开始

### 前置条件

| 项目 | 要求 |
| --- | --- |
| 运行环境 | Node.js（本模块在 **Node 24** 上开发与验证） |
| 数据库 | **PostgreSQL**（复用宿主的 `pg` 连接池） |
| 宿主 | 一个提供下文[接入契约](#对宿主的依赖接入契约)所列接缝的 Nuxt 4 项目 |

模块**没有自己的 `package.json`**：它不声明也不安装依赖，一切运行时依赖（Nuxt、Nuxt UI、`@nuxtjs/i18n`、Drizzle、`pg`）都由宿主提供。

### 作为 Nuxt Layer 接入

把本仓库放到宿主的 `modules/library`：

```bash
git clone <本仓库地址> modules/library
```

宿主会自动发现它。只要设置对应环境变量即可启用：

```bash
# .env
LIBRARY_ENABLED=true
```

宿主侧的自动发现逻辑（`nuxt.config.ts`）会把每个满足 `<NAME>_ENABLED=true` 的 `modules/<name>` 目录作为 Nuxt Layer 挂载，因此 **`modules/library` + `LIBRARY_ENABLED=true` 之外不需要改任何宿主代码**。也可以显式指定路径：

```bash
EXTENDS_MODULES="./modules/library"
```

### 启用后会发生什么

1. **接管站点根路径**：宿主的落地页（`/`）会被移除，首页直接是目录页。是否接管只由 Layer 挂载开关决定——**想保留原首页就不挂载本层**；`library.clearSiteNavigation` 管的是另一件事：是否清空宿主**顶部导航**（书架自带分区导航，留着旧链接容易让人困惑）。
2. **挂载模块页面**：`/library/**` 下的目录、书架、详情、阅读等页面由本层提供。
3. **建表与升级**：启动时执行幂等迁移（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`），可安全地在每次启动重复执行。
4. **注册后台**：把目录表注册进宿主的通用后台 CRUD 与侧边栏菜单，管理员可直接查看与维护。
5. **种下教程书**：仅当书目为空时，生成并入库一本使用教程，作为唯一的初始书籍。

### 页面一览

| 路由 | 内容 |
| --- | --- |
| `/` 与 `/library` | 目录页（全部图书）：搜索、筛选、排序、批量管理、回收站 |
| `/library/shelf` | 我的书架：在读 / 已读完 / 收藏 |
| `/library/collections`、`/library/collections/:id` | 书单列表与详情 |
| `/library/authors`、`/library/series`、`/library/publishers`、`/library/tags` | 浏览页 |
| `/library/book/:id` | 书籍详情（文件、元数据、统计、编辑与转换入口） |
| `/library/read/:id` | 阅读器（EPUB 走自定义阅读器，PDF 等交给浏览器内置） |

---

## 目录结构

```
modules/library/
├── index.ts                     # Nuxt 模块入口：pages:extend 接管 `/`
├── nuxt.config.ts               # Layer 的 i18n locale 声明
├── app/
│   ├── pages/library/           # 目录页（含回收站）、我的书架、详情、阅读、书单、浏览页
│   ├── components/library/      # 15 个组件（含 EpubReader、批注工具条与面板）
│   ├── composables/             # useLibrary / useReaderTts / useReaderAnnotations
│   └── utils/                   # annotations.ts（批注词汇表）、reader.ts（排版数学）
├── server/
│   ├── api/library/             # 33 个接口
│   ├── database/                # schema.ts（13 张表）+ migrate.ts（幂等 DDL）
│   ├── plugins/library.ts       # Nitro 启动插件：迁移、注册、种书
│   ├── seed/tutorial.ts         # 内置教程书的正文与 EPUB 打包
│   └── utils/                   # zip / ebook / html / convert / douban / net / indexer …
├── i18n/locales/                # en / zh / zh-TW
└── test/                        # 110 个单元测试
```

---

## 数据模型

模块自带 13 张表，全部以 `lib_` 为前缀，幂等建表：

| 表 | 说明 |
| --- | --- |
| `lib_books` | 书籍主表（标题、作者关联、分类、系列、ISBN、封面、统计计数…） |
| `lib_book_files` | 书籍文件（格式、路径、哈希、主文件标记） |
| `lib_book_chapters` | 章节纯文本索引（书内全文搜索的来源） |
| `lib_authors` / `lib_book_authors` | 作者与书籍-作者多对多 |
| `lib_series` / `lib_publishers` | 系列（含卷次）与出版社 |
| `lib_categories` | 分类（浅树） |
| `lib_collections` / `lib_collection_books` | 书单与书单条目 |
| `lib_favorites` | 收藏 |
| `lib_reading_progress` | 阅读进度（百分比、位置、状态） |
| `lib_bookmarks` | 书签 / 划线 / 笔记（`type` 区分；划线含 `style`、`color`、`start_offset`、`end_offset`） |

软删除统一用 `deleted_at`：书籍与文件一起进出回收站，保证目录视图与存储统计始终一致。

---

## 接口一览

全部位于 `/api/library/**`（除标注外均需登录）。

**书籍**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/books` | 列表（分页、筛选、排序） |
| `POST` | `/books` | 新建 |
| `GET` | `/books/:id` | 详情（含文件与可用性标记） |
| `PUT` | `/books/:id` | 更新 |
| `DELETE` | `/books/:id` | 软删除 |
| `POST` | `/books/upload` | 上传（multipart；带 `bookId` 时作为**补充文件**挂到已有书） |
| `POST` | `/books/batch` | 批量 `soft-delete` / `restore` / `permanent-delete` |
| `GET` | `/books/trashed` | 回收站 |
| `GET` | `/books/:id/content` | 阅读内容（`?chapter=` 指定章、`?highlight=` 高亮搜索命中） |
| `GET` | `/books/:id/asset` | 书内资源（图片等，鉴权代理） |
| `POST` | `/books/:id/convert` | 格式转换 |

**书单 / 收藏 / 进度**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` `POST` | `/collections` | 书单列表 / 新建 |
| `GET` `PUT` `DELETE` | `/collections/:id` | 书单详情 / 更新 / 删除 |
| `POST` | `/collections/:id/books` | 增删书单条目 |
| `GET` | `/favorites` | 收藏列表 |
| `POST` | `/favorites` | 切换收藏 |
| `GET` `PUT` | `/progress` | 读取 / 保存阅读进度 |

**批注（书签 / 划线 / 笔记）**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/bookmarks?bookId=` | 某本书的全部批注（按章与位置排序，已过滤软删） |
| `POST` | `/bookmarks` | 新建；`style`/`color` 走白名单校验，`startOffset`/`endOffset` 必须成对且正向 |
| `PUT` | `/bookmarks/:id` | 更新 `style` / `color` / `note` |
| `DELETE` | `/bookmarks/:id` | 删除 |

**其它**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/metadata/search` | 豆瓣搜索 |
| `POST` | `/metadata/fetch` | 抓取详情（只返回，不写库） |
| `POST` | `/metadata/cover` | 抓取并落地封面 |
| `GET` | `/search` | 书内 / 全库全文搜索（`?q=&bookId=&limit=`） |
| `GET` | `/facets` | 筛选面（分类、标签、作者…） |
| `GET` | `/stats` | 统计 |
| `GET` | `/convert/options` | 可用的转换目标格式 |
| `GET` | `/files/:id/download` | 下载电子书（鉴权） |

---

## 阅读器

阅读器不使用任何第三方排版引擎：章节内容被塞进一组 **CSS 多栏**，每栏宽度恰好一页，然后整块内容按页做**水平平移**（`transform`，而非滚动）。

这样做的直接好处是交互语义干净：一次手势只翻一页，永远不可能停在一个"半页"上。两个容易踩的坑都被显式处理：

1. **相邻页在排版上是相邻的栏**，所以栏间距必须 ≥ 页边距，否则下一页会从边距里露出一条——"第 1 页右边能看到第 2 页"这个经典 bug。
2. **栏间距在每一栏之后都会出现**，因此双页的步进是 `2 × (栏宽 + 栏距)`，而不是 `2 × 栏宽 + 栏距`（后者每翻一屏都会少一个栏距）。

排版相关：

| 项目 | 取值 |
| --- | --- |
| 版面 | 分页（默认） / 双页 / 滚动；双页在窗口过窄时自动不可用并给出提示 |
| 字号 | 12–32 px |
| 行距 | 1.4–2.4 |
| 页宽 | 仅滚动版面，640–1080 px 若干档 |
| 主题 | 明亮 / 护眼 / 暗色 |
| 翻页 | 底部按钮、`←` `→`、滚轮、触控板左右滑动、触屏横滑 |
| 其它 | 目录（含锚点）、全屏、书签、进度同步（防抖保存） |

**改字号或行距后会自动重新分页**，并按比例保住当前阅读位置。

---

## 划线高亮与笔记

### 交互

1. 选中正文 → 浮出工具条：第一排 6 种**颜色**，第二排 6 种**线型**。
2. 点任意一个即刻生效并立刻保存；工具条保持打开，因此可以继续点击把颜色与线型**组合**起来。
3. 「笔记」按钮打开引文 + 输入框；如果是对新选中文字写笔记，会先创建划线再挂上笔记——**笔记永远依附于一段具体文字**，因此永远能跳回去。
4. 点击已有划线进入编辑态（换色 / 换线型 / 编辑笔记 / 删除）。
5. 工具栏的笔记本图标打开「我的批注」面板，按章节列出全书划线、笔记与书签，点击跳章并定位到那一页。

### 颜色与线型

| 颜色 | 黄 · 绿 · 蓝 · 粉 · 紫 · 橙 |
| --- | --- |
| **线型** | 底色高亮 · 单下划线 · 双下划线 · 点状下划线 · 虚线下划线 · 波浪下划线 |

系统会记住上次使用的颜色与线型，连续划线时不用每次重选。

### 实现要点

- **锚点是字符区间，不是像素坐标**。每条批注记录它在整章纯文本中的 `start_offset` / `end_offset`。字号、行距、窗口怎么变，区间都不失效；反之，如果把同一本书的文件换成另一个校对版本，旧锚点可能就偏了（这也是为什么同一本书的文件应保持稳定）。
- **只统计可读散文节点**。书的样式表会被内联进章节，若不排除它，所有偏移都会整体错位，朗读还会把 CSS 念出来。
- **颜色通过 CSS 自定义属性下发**（`--anno-ink` / `--anno-wash`），因此样式表只需"每种线型一条规则"，而不是"每种颜色 × 每种线型"一条。
- 服务端对 `style` / `color` 做白名单校验（词汇表定义在 `app/utils/annotations.ts`，服务端直接复用），划线无法把任意 CSS 带进阅读器。

---

## 格式转换

两条路径，都会**生成一个新文件**挂到书上，原文件保持不变（转错可直接删掉新文件）。

**一、模块自己完成（永远可用，无需任何外部程序）**

| 从 | 到 |
| --- | --- |
| EPUB | TXT、HTML |
| TXT / Markdown | EPUB、HTML、TXT |
| HTML | EPUB、TXT |

转换 TXT 时会尝试识别"第一章"这类标题自动分章，识别不出就按长度切分。

**二、交给 Calibre（需要安装 `ebook-convert`）**

PDF、MOBI、AZW3、RTF、DOCX、FB2 需要外部的 `ebook-convert`。安装后模块会自动探测，也可以用 `library.converter.path` 指定。

> 为什么不能全都自己来：PDF 本质是"排版好的纸张"，没有段落与章节结构，还原成可重排 EPUB 需要版面分析、字体度量与大量启发式规则——那是 Calibre 十几年的积累。与其写一个拙劣替代品，不如交给专业工具，并在它缺席时**明确拒绝**而不是产出损坏的文件。

---

## 内置教程书

`server/seed/tutorial.ts` 里有 12 章中文使用教程，在**书目为空**时被生成 EPUB 并入库，作为唯一的初始书籍（新装环境打开就是一本能读、能划线、能搜索的书）。

它没有以二进制文件的形式提交：正文以 XHTML 写在源码里，由模块**自己的 ZIP 写入器**打包，含 SVG 封面与 EPUB3 目录。改正文即可，下次启动重新生成。

---

## 配置项

模块在首次启动时把下列默认值写入宿主的 `configs` 表（**admin 之后的修改会被保留**）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `library.enabled` | `true` | 模块总开关；关闭后模块完全不注册任何东西 |
| `library.clearSiteNavigation` | `true` | 接管首页时清空宿主顶部导航 |
| `library.maxFileSizeMB` | `200` | 单个电子书文件大小上限 |
| `library.douban.enabled` | `true` | 启用豆瓣元数据抓取 |
| `library.douban.baseUrl` | `https://book.douban.com` | 目标站点（可换成镜像） |
| `library.douban.cookie` | 空 | 可选 Cookie，用于降低被限流概率 |
| `library.douban.timeoutMs` | `8000` | 抓取超时 |
| `library.converter.enabled` | `true` | 允许格式转换 |
| `library.converter.path` | 空 | `ebook-convert` 路径（留空自动探测） |
| `library.converter.timeoutMs` | `120000` | 外部转换超时 |

环境变量：`LIBRARY_ENABLED=true`（Layer 挂载开关，见[快速开始](#快速开始)）。

---

## 对宿主的依赖（接入契约）

模块通过相对路径直接引用宿主 `server/` 与 `app/` 中的少量文件——这是刻意的"接缝"，**不复制宿主代码、也不要求宿主为模块改代码**：

**服务端**

| 来源 | 使用 |
| --- | --- |
| `server/database` | `db`（Drizzle 实例）、`pool`（执行原生 DDL） |
| `server/database/schema` | `configs`（配置表）、`files`（宿主文件表，用于登记封面）、`users` |
| `server/utils/auth` | `requireUser`、`getSessionUser`、`isAdmin` |
| `server/utils/configs` | `getConfigValue`、`upsertConfig` |
| `server/utils/fileStorage` | `buildStoragePath`、`saveToStorage`、`getAbsolutePath`、`fileExists`、`calculateHash`、`createStorageStream` 等 |
| `server/utils/dashboard/tables` | `registerDrizzleSchema`、`registerDashboardTable`、`DEFAULT_MENU` |

**客户端**（自动导入）

| 来源 | 使用 |
| --- | --- |
| `app/utils/network.ts` | `cGet` / `cPost` / `cPut` / `cDelete`、`extractErrorMessage` |
| `app/utils/index.ts` | `formatBytes` |
| `app/components/dashboard/crud/formModal.vue` | `DashboardCrudFormModal`（书单编辑弹窗复用） |

此外依赖宿主的 Nuxt UI 组件与 `@nuxtjs/i18n`。

> 如果你的宿主缺少上述任一接缝，需要先补齐或做适配——模块不会自带这些能力。

---

## 开发

模块**没有 `package.json`**，命令一律从**宿主仓库根目录**执行：

```bash
# 单元测试（110 个用例）
node_modules/.bin/vitest run --config modules/library/vitest.config.ts

# 代码规范（--no-ignore 是必需的：宿主的 .gitignore 忽略了 modules/）
node_modules/.bin/eslint --no-ignore modules/library

# 类型检查（LIBRARY_ENABLED=true 才会挂载本层）
LIBRARY_ENABLED=true node_modules/.bin/nuxt typecheck
```

测试覆盖的是**纯函数**：排版数学（分栏几何、页数与偏移映射、位置换算）、批注词汇表、ZIP 读写、EPUB/OPF 解析、HTML 净化与高亮、豆瓣解析器、格式转换。涉及 DOM 的渲染与交互不在单测范围内。

### 代码约定

- **不新增依赖**：需要的能力要么自己实现（见 `server/utils/zip.ts`、`ebook.ts`、`html.ts`），要么交给可选的外部程序（Calibre），要么复用宿主。
- **纯逻辑抽成纯函数**放在 `app/utils` 或 `server/utils`，组件与路由只做编排——这样排版数学之类的易错逻辑才能被单测覆盖。
- **注释解释"为什么"**，尤其是那些看起来可以更简单、但实际不能的地方（例如栏间距为什么是页边距的下限、批注为什么不存像素坐标）。

---

## 已知限制

- **PDF 不参与全文索引**，也不走本模块的阅读器（交给浏览器内置渲染），因此没有划线批注能力。
- **TTS 完全依赖浏览器与操作系统**：可用语音、音质、是否需要用户先与页面交互，都因设备而异；服务端不参与。
- **批注锚定字符区间**：把同一本书的文件替换成另一版文字后，旧批注可能错位（删掉重划即可）。
- **彻底删除只移除数据库记录**，不会删除磁盘文件。要清理磁盘需由运维确认后处理，模块刻意不代劳——避免一次误操作同时抹掉数据库与磁盘两处的证据。
- **豆瓣抓取依赖目标站点**，可能被限流或改版；抓取失败不影响已有内容与保存流程。
- **删除为软删除**：`lib_bookmarks` 等表中的删除会把行标记为 `deleted_at` 而非物理移除，需要彻底清理由后台处理。

---

## 许可

本模块为私人项目，未附带独立许可证文件；使用与分发请遵循其所在宿主项目的约定。
