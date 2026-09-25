/**
 * Library module — the built-in usage tutorial.
 *
 * This is the library's only shipped book: a fresh installation seeds it so the
 * shelf is never empty and the reader's features are documented *inside* the
 * reader. It is authored as XHTML here and packaged by the module's own
 * dependency-free ZIP writer, so there is no binary blob to keep in sync — edit
 * the chapters and the EPUB regenerates on the next boot.
 */
import { createZip } from '../utils/zip'

export interface TutorialChapter {
  title: string
  /** Body markup only; the chapter shell is added by the builder. */
  body: string
}

export const TUTORIAL_TITLE = '私人图书馆使用手册'
export const TUTORIAL_AUTHOR = '私人图书馆'
export const TUTORIAL_LANGUAGE = 'zh-CN'
export const TUTORIAL_FILENAME = 'library-guide.epub'

const DESCRIPTION = '私人图书馆（Nuxt 图书馆模块）的完整使用教程：上传整理、元数据、阅读器、划线高亮与笔记、书内搜索、朗读、格式转换与回收站。'

const CSS = `body { line-height: 1.75; }
h1 { font-size: 1.5em; margin: 0 0 1em; }
h2 { font-size: 1.15em; margin: 1.6em 0 0.6em; }
h3 { font-size: 1em; margin: 1.3em 0 0.5em; }
p { margin: 0 0 1em; }
ul, ol { margin: 0 0 1em 1.4em; padding: 0; }
li { margin: 0.35em 0; }
blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 3px solid #8a8a8a; }
code { padding: 0 0.25em; border-radius: 3px; background: rgba(127, 127, 127, 0.16); }
kbd { padding: 0 0.35em; border: 1px solid #8a8a8a; border-radius: 3px; font-size: 0.9em; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #8a8a8a; padding: 0.35em 0.6em; text-align: left; }
.lead { font-size: 1.05em; }
.muted { color: #6b7280; }
`

const COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e3a8a"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <rect x="40" y="40" width="520" height="720" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.55"/>
  <text x="300" y="330" text-anchor="middle" font-family="Songti SC, Noto Serif CJK SC, serif" font-size="58" fill="#f8fafc">私人图书馆</text>
  <text x="300" y="410" text-anchor="middle" font-family="Songti SC, Noto Serif CJK SC, serif" font-size="40" fill="#bfdbfe">使用手册</text>
  <line x1="180" y1="460" x2="420" y2="460" stroke="#93c5fd" stroke-width="1.5" opacity="0.7"/>
  <text x="300" y="520" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#93c5fd" letter-spacing="4">PRIVATE LIBRARY</text>
  <text x="300" y="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#64748b">Nuxt Library Module</text>
</svg>`

/** The tutorial, in reading order. */
export const TUTORIAL_CHAPTERS: TutorialChapter[] = [
  {
    title: '第一章 这是什么',
    body: `
<p class="lead">欢迎。你正在读的书，是这套私人图书馆随库自带的使用手册——它由系统自己在首次启动时生成，也是这台图书馆里唯一的初始书籍。</p>

<h2>它是什么</h2>
<p>私人图书馆是一个可插拔的模块（位于项目的 <code>modules/library</code>），目标是把一台服务器上散落的电子书变成一座能长期使用的私人图书馆：上传、整理元数据、在线阅读、划线做笔记、全文搜索、朗读、格式转换、回收站。</p>
<p>它遵循三个克制的前提：</p>
<ul>
  <li><strong>不引入第三方依赖</strong>。EPUB 解析、ZIP 读写、分页排版、格式转换全部自己实现，因此可以在一个空 Node 环境里跑起来。</li>
  <li><strong>只做私有的书库</strong>。电子书文件不走任何公开路由，只能通过模块自己的鉴权接口下载，避免书籍被外部索引到。</li>
  <li><strong>复用而不是重写宿主能力</strong>。账号、权限、配置、文件存储都沿用宿主项目已有的机制。</li>
</ul>

<h2>启用之后会发生什么</h2>
<p>模块启用时，它会接管站点根路径：访问网站首页看到的直接就是书架，而不是原来的首页。同时站点顶部的导航会被清空（书籍库自带分区导航，留着旧链接只会让人困惑）。这两件事都可以在系统配置里关掉。</p>

<h2>你需要知道的三个层次</h2>
<table>
  <tr><th>层次</th><th>在哪里</th><th>谁会用</th></tr>
  <tr><td>书架与阅读</td><td>站点首页、书籍详情页、阅读页</td><td>所有登录用户</td></tr>
  <tr><td>整理与元数据</td><td>上传、编辑、豆瓣元数据、书单</td><td>书籍所有者与管理员</td></tr>
  <tr><td>后台表与配置</td><td>宿主的管理后台</td><td>管理员</td></tr>
</table>
<p>本手册按这三次层次依次展开。你可以用目录跳转，也可以从下一页的「快速开始」直接上手。</p>
`
  },
  {
    title: '第二章 快速开始',
    body: `
<p class="lead">五分钟之内，你会完成从「一本书都没有」到「翻开并划线」的全过程。</p>

<h2>1. 打开书架</h2>
<p>访问站点首页。如果模块已经启用，这里就是书架。页面顶部是分区导航：<strong>书架、分类、书单、作者、系列、出版社、搜索</strong>。首次进来时书架上只有你正在读的这本手册。</p>

<h2>2. 上传第一本书</h2>
<p>点击右上角的<strong>上传图书</strong>按钮，把 EPUB、PDF、TXT、MOBI、AZW3、FB2、DJVU、CBZ、CBR 等文件拖进去即可。系统会：</p>
<ul>
  <li>从 EPUB 内部读出标题、作者、简介、标签、ISBN、语言、出版社、出版日期、系列与封面；</li>
  <li>读不到时，从文件名（例如 <code>三体 - 刘慈欣.epub</code>）里推断标题与作者；</li>
  <li>把封面登记为宿主的文件，供书架直接显示；</li>
  <li>为 EPUB 建立全文索引，让书内搜索立刻可用。</li>
</ul>
<p>可以一次拖入多个文件，也可以先建一本书、之后再补文件。</p>

<h2>3. 打开阅读</h2>
<p>在书籍卡片上点击<strong>在线阅读</strong>（或进入详情页后点击阅读）。EPUB 会进本模块自带的阅读器，PDF 与纯文本则交给浏览器内置的阅读器。阅读进度会自动保存，下次打开会回到原来的位置。</p>

<h2>4. 划线</h2>
<p>用鼠标选中任意一句话，会浮出一个工具条：六个颜色、六种线型、以及<strong>笔记</strong>。点一下颜色，这句话就被划上了。详见「第六章 划线、高亮与笔记」。</p>

<h2>接下来</h2>
<ul>
  <li>想批量整理：看<strong>第三章 上传、分类与书单</strong>；</li>
  <li>想让书籍信息变漂亮：看<strong>第四章 元数据与豆瓣</strong>；</li>
  <li>想把阅读器调成自己顺手的样子：看<strong>第五章 阅读器</strong>。</li>
</ul>
`
  },
  {
    title: '第三章 上传、分类与书单',
    body: `
<p class="lead">图书馆的价值不在于「存了多少」，而在于「找得到」。这一章讲怎么把书放进来、怎么组织。</p>

<h2>支持的文件格式</h2>
<table>
  <tr><th>格式</th><th>在线阅读</th><th>说明</th></tr>
  <tr><td>EPUB</td><td>本模块阅读器</td><td>分页／双页／滚动、划线、搜索、朗读全部可用</td></tr>
  <tr><td>PDF</td><td>浏览器内置</td><td>由浏览器渲染，模块不参与排版</td></tr>
  <tr><td>TXT / Markdown</td><td>浏览器内置</td><td>也可以转换成 EPUB 获得完整体验</td></tr>
  <tr><td>MOBI / AZW3 / FB2 / RTF / DOCX</td><td>需先转换</td><td>借助外部 Calibre 转成 EPUB 后阅读</td></tr>
  <tr><td>DJVU / CBZ / CBR</td><td>—</td><td>可入库、可下载</td></tr>
</table>
<p>单文件大小上限由配置 <code>library.maxFileSizeMB</code> 控制，默认 200 MB。</p>

<h2>一本书，多个文件</h2>
<p>同一本书可以有多个文件（例如同时有 EPUB 和 PDF）。阅读时会优先挑 EPUB；如果某个文件在磁盘上丢失了，详情页会把它标成「文件缺失」，并提供<strong>补充文件</strong>按钮，让你重新上传一份挂到同一本书上，进度、书签、批注都不会丢。</p>

<h2>分类、标签、书单</h2>
<ul>
  <li><strong>分类</strong>是一棵浅树（文学、科技、历史……），一本书最多属于一个分类，用于书架上的主导航。</li>
  <li><strong>标签</strong>是自由关键词，一本书可以有很多个，用于进一步筛选。</li>
  <li><strong>书单</strong>是人工挑选的合集，可以跨分类、跨作者地组织，例如「今年要读完的十本」。</li>
</ul>
<p>三者并不重复：分类回答「它属于哪一类」，标签回答「它涉及什么」，书单回答「我为什么把它放在一起」。</p>

<h2>作者、系列、出版社</h2>
<p>它们是独立的数据表，而不是书上的一个字符串。好处是同一作者的多本书会自动聚合到同一个作者页；系列还会记住卷次，让「三体 II」排在「三体 I」后面。</p>

<h2>批量管理</h2>
<p>书架支持进入批量模式：勾选多本后统一删除或恢复。删除一律是<strong>软删除</strong>——书会进入回收站，随时可以恢复，详见「第十章 删除与回收站」。</p>

<h2>可见性</h2>
<p>每本书都有一个所有者，以及一个「公开」开关。公开的书所有登录用户都能看到；未公开的书只有所有者与管理员能看到。修改与删除永远只限所有者与管理员。</p>
`
  },
  {
    title: '第四章 元数据与豆瓣',
    body: `
<p class="lead">一本没有封面、没有作者、标题是乱码拼音的书，等于不在书架上。补全元数据是让图书馆「像样」的最快一步。</p>

<h2>手动编辑</h2>
<p>书籍详情页的「编辑」可以修改标题、副标题、作者、简介、标签、分类、系列与卷次、出版社、出版日期、ISBN、语言、页数、评分与封面。</p>

<h2>从豆瓣抓取</h2>
<p>编辑界面里的<strong>豆瓣元数据</strong>按钮会打开一个搜索框：</p>
<ol>
  <li>输入书名（或 ISBN），点击搜索；</li>
  <li>从结果列表里挑出正确的那一本；</li>
  <li>系统抓取标题、作者、简介、出版社、出版日期、ISBN、评分与封面；</li>
  <li>封面会被下载到本地存储，而不是留一个外链；</li>
  <li>抓到的内容<strong>只会填进表单</strong>——你必须点击保存才会真正写库。</li>
</ol>
<blockquote>第 5 条是刻意的：抓取结果可能不完全正确，先让你看一眼再保存，比悄悄改掉你的书籍信息要安全。</blockquote>
<p>相关的配置项：</p>
<ul>
  <li><code>library.douban.enabled</code>：总开关；</li>
  <li><code>library.douban.baseUrl</code>：站点地址，可以改成镜像站；</li>
  <li><code>library.douban.cookie</code>：可选的 Cookie，用于降低被限流的概率；</li>
  <li><code>library.douban.timeoutMs</code>：请求超时。</li>
</ul>

<h2>为什么抓不到</h2>
<ul>
  <li>目标站点限流或需要登录——填入 Cookie 重试；</li>
  <li>书名太泛，搜索结果里没有你要的那一本——改用 ISBN 精确搜索；</li>
  <li>网络出站被限制——模块对出站请求做了安全校验，默认只允许公网地址。</li>
</ul>
<p>抓取失败不会影响你已经填好的内容，也不会阻塞保存。</p>
`
  },
  {
    title: '第五章 阅读器',
    body: `
<p class="lead">这一章是本手册的重点：阅读器几乎每一个零件都可以调，而且它记住了你的选择。</p>

<h2>三种版面</h2>
<p>工具栏右侧的第一个按钮可以在三种版面之间循环切换，按钮上的文字就是当前版面：</p>
<table>
  <tr><th>版面</th><th>效果</th><th>适合</th></tr>
  <tr><td>分页</td><td>一屏一页，像纸书一样左右翻</td><td>大多数阅读场景</td></tr>
  <tr><td>双页</td><td>一屏两页，模拟摊开的书</td><td>宽屏</td></tr>
  <tr><td>滚动</td><td>连续纵向滚动</td><td>快速略读、长章节</td></tr>
</table>
<p>在分页与双页之间切换时，阅读位置会按比例保留；页面窗口太窄时双页会自动不可用并给出提示。</p>

<h2>翻页方式</h2>
<ul>
  <li>点击底部的<strong>上一章／下一章</strong>按钮；</li>
  <li>键盘 <kbd>←</kbd> <kbd>→</kbd>；</li>
  <li>鼠标滚轮；</li>
  <li>笔记本触控板<strong>左右滑动</strong>——在分页模式下这是翻页，而不是横向拖动页面本身；</li>
  <li>手机／平板上横向滑动。</li>
</ul>
<p>分页模式下页面是「整页平移」的：一次手势只会翻一页，永远不会出现半页停在屏幕中间的情况。</p>

<h2>排版与主题</h2>
<ul>
  <li><strong>字号</strong>：12–32 像素；</li>
  <li><strong>行距</strong>：1.4–2.4；</li>
  <li><strong>页宽</strong>：仅影响滚动版面；</li>
  <li><strong>主题</strong>：明亮、护眼（米黄）、暗色。</li>
</ul>
<p>改动字号或行距后，分页会<strong>自动重新计算</strong>，并尽量把你停在原来的位置——你不需要手动去找「刚才读到哪了」。</p>

<h2>目录、进度与全屏</h2>
<p>左上角的列表按钮打开目录，支持多级缩进，点击即跳转（含锚点定位）。顶部的进度条显示全书完成度，阅读进度会防抖保存。全屏按钮让阅读器占满屏幕，按 <kbd>Esc</kbd> 退出。</p>

<h2>书签</h2>
<p>书签按钮记下「当前这一处」。与划线不同，书签不绑定具体文字，因此可以在任何位置使用。所有书签都会出现在「我的批注」面板里。</p>

<h2>它是怎么实现的（好奇的话）</h2>
<p>分页不使用任何第三方排版引擎：章节内容被塞进一组 CSS 多栏里，每栏宽度恰好一页，然后整块内容按页做水平平移。这里有两个容易踩的坑，都被显式处理了：</p>
<ul>
  <li>相邻页在排版上是<strong>相邻的栏</strong>，所以栏间距必须不小于页边距，否则下一页会露出一条边——「第 1 页右边能看到第 2 页」这个经典 bug；</li>
  <li>栏间距在<strong>每一栏之后</strong>都会出现，因此双页的步进是「两栏宽 + 两个间距」，而不是「两栏宽 + 一个间距」。</li>
</ul>
`
  },
  {
    title: '第六章 划线、高亮与笔记',
    body: `
<p class="lead">这是本模块最值得用起来的功能：读到重要的地方，选中、点一下，它就留在那儿了，而且下次打开还在。</p>

<h2>怎么划</h2>
<ol>
  <li>用鼠标（或手指）选中一段文字；</li>
  <li>浮出的工具条上第一排是<strong>颜色</strong>，第二排是<strong>线型</strong>；</li>
  <li>点任意一个，这段话立刻被标记，并且立刻保存；</li>
  <li>工具条会保留在原地，你可以接着点另一种颜色或线型，把两者组合起来；</li>
  <li>点击别处即可收起。</li>
</ol>
<blockquote>如果只想快速划一下，点一次颜色就够了——默认线型是底色高亮。</blockquote>

<h2>六种颜色</h2>
<p>黄、绿、蓝、粉、紫、橙。系统会记住你上一次用的颜色，下一次划线默认沿用它。</p>

<h2>六种线型</h2>
<table>
  <tr><th>线型</th><th>样式</th></tr>
  <tr><td>高亮</td><td>用颜色填充文字底色</td></tr>
  <tr><td>下划线</td><td>单实线</td></tr>
  <tr><td>双下划线</td><td>双实线</td></tr>
  <tr><td>点状下划线</td><td>圆点线</td></tr>
  <tr><td>虚线下划线</td><td>短划线</td></tr>
  <tr><td>波浪下划线</td><td>波浪线</td></tr>
</table>
<p>颜色与线型可以自由组合：用黄底表示「重点」，用红色波浪线表示「存疑」，用蓝色双下划线表示「需要引用」——完全由你自己的习惯决定。</p>

<h2>输入笔记</h2>
<p>工具条上的<strong>笔记</strong>按钮会打开一个输入框，引文显示在上面，你的想法写在下面。保存后：</p>
<ul>
  <li>这段划线仍然按你选的颜色和线型显示；</li>
  <li>把鼠标停在划线上，会看到笔记内容；</li>
  <li>「我的批注」面板里，笔记以引用块的形式展示在引文下方。</li>
</ul>
<p>如果笔记是对一段新选中的文字写的，系统会先创建划线、再挂上笔记——笔记永远依附于一段具体文字，因此永远能跳回去。</p>

<h2>修改与删除</h2>
<ul>
  <li>点击任意一条已有划线，工具条会以「编辑」形态出现，可以换颜色、换线型、编辑笔记或删除；</li>
  <li>「我的批注」面板中，每一条都可以直接编辑或删除；</li>
  <li>删除是立刻生效的（会从数据库移入回收逻辑，但不再出现在书里）。</li>
</ul>

<h2>「我的批注」面板</h2>
<p>工具栏上的笔记本图标打开面板，按章节顺序列出全书所有的划线、笔记与书签。点击任意一条即可跳到它所在的位置；如果它在别的章节，阅读器会先切章、再定位到那一页。</p>

<h2>它是怎么定位的</h2>
<p>每一条批注记录的是一段<strong>字符区间</strong>（在整章纯文本中的起止位置），而不是像素坐标。因为排版会随字号、行距、窗口大小不断变化，像素坐标下一秒就失效了，而字符区间不会。代价是：如果某天书籍内容本身被替换成了另一版文字，旧的批注可能对不上——这也是为什么同一本书的文件应当保持稳定。</p>
`
  },
  {
    title: '第七章 书内全文搜索',
    body: `
<p class="lead">「我明明记得书里写过这句话。」——书内搜索就是为这个瞬间准备的。</p>

<h2>怎么用</h2>
<ol>
  <li>阅读器工具栏上的放大镜按钮打开搜索面板；</li>
  <li>输入关键词，边输入边搜（约 350 毫秒防抖）；</li>
  <li>结果按章节列出，附带命中位置的上下文与章节名；</li>
  <li>点击任意一条，阅读器跳到该章节，并把<strong>第一处命中高亮</strong>标出来。</li>
</ol>

<h2>索引从哪来</h2>
<p>EPUB 上传时会自动抽取每一章的纯文本并建立索引。如果某个历史书籍还没有索引，第一次搜索时会<strong>按需重建</strong>，因此你不需要手动触发任何「重新索引」操作。索引存放在独立的章节表里，与原始文件解耦。</p>

<h2>为什么中文也能搜</h2>
<p>常见的全文搜索依赖分词器（例如 PostgreSQL 的 tsvector），而中文分词需要额外扩展。这里选择了一个更朴素但更稳的方案：直接对章节文本做大小写无关的子串匹配。它不支持词干还原与模糊匹配，但对「我记得原文里有这几个字」这种真实需求来说，命中率反而更高。</p>

<h2>与书签、划线的关系</h2>
<p>三者不冲突：搜索负责<strong>找</strong>，书签负责<strong>记住位置</strong>，划线负责<strong>记住内容</strong>。用完搜索之后，如果这段文字值得反复回来，就顺手划一下。</p>
`
  },
  {
    title: '第八章 朗读',
    body: `
<p class="lead">躺着看书的时候，让浏览器替你念。</p>

<h2>怎么用</h2>
<p>工具栏上的音量按钮开始朗读。朗读条会出现，包含播放／暂停、停止、上一句、下一句、语音选择与语速（0.5×–2×）。</p>

<h2>它做的事</h2>
<ul>
  <li>把当前章节拆成句子级的片段（中文按 <code>。！？</code>，英文按句点，过长的句子在逗号处再切分），这样暂停与跳句才精确；</li>
  <li>朗读到哪一句，就把哪一句用浅蓝底色标出来；</li>
  <li>在分页模式下会自动翻到那一句所在的页；</li>
  <li>一章读完自动接着读下一章。</li>
</ul>

<h2>语音与语言</h2>
<p>语音列表来自你的操作系统与浏览器。系统会按书籍的语言自动挑选合适的语音（例如中文书优先中文语音），你也可以手动指定。如果列表是空的，通常说明系统还没有安装任何语音包。</p>

<h2>已知限制</h2>
<ul>
  <li>朗读使用浏览器的语音合成能力，因此<strong>可用性与音质取决于浏览器和操作系统</strong>，不同设备上差别很大；</li>
  <li>部分浏览器要求页面先有过一次用户交互才允许发声；</li>
  <li>朗读期间仍然可以正常翻页、划线——只是自动翻页会与手动操作竞争，此时以朗读的进度为准。</li>
</ul>
`
  },
  {
    title: '第九章 格式转换',
    body: `
<p class="lead">手头只有一份 TXT 或者 DOCX？先转成 EPUB，就能用上划线、搜索与朗读。</p>

<h2>两条转换路径</h2>
<h3>一、模块自己完成（永远可用）</h3>
<table>
  <tr><th>从</th><th>到</th></tr>
  <tr><td>EPUB</td><td>TXT、HTML</td></tr>
  <tr><td>TXT / Markdown</td><td>EPUB、HTML、TXT</td></tr>
  <tr><td>HTML</td><td>EPUB、TXT</td></tr>
</table>
<p>这些转换由模块内的解析器与生成器完成，不依赖任何外部程序。转换 TXT 时会尝试识别「第一章」这类标题来自动分章；识别不出就按长度切分成若干部分。</p>

<h3>二、交给 Calibre（需要安装）</h3>
<p>PDF、MOBI、AZW3、RTF、DOCX、FB2 这些格式需要外部的 <code>ebook-convert</code>。安装 Calibre 之后，模块会自动找到它；也可以在配置里指定路径：</p>
<ul>
  <li><code>library.converter.enabled</code>：总开关；</li>
  <li><code>library.converter.path</code>：<code>ebook-convert</code> 的完整路径（留空则自动探测）；</li>
  <li><code>library.converter.timeoutMs</code>：单次转换的超时时间。</li>
</ul>

<h2>为什么不能「全都自己来」</h2>
<p>PDF 本质上是「排版好的纸张」，没有段落与章节的结构信息；把它还原成可重排的 EPUB 需要版面分析、字体度量与大量启发式规则——那是 Calibre 积累了十几年的工作。与其自己写一个拙劣的替代品，不如把这一步交给专业工具，并保证在它缺席时优雅降级。</p>

<h2>转换结果放在哪</h2>
<p>转换结果会作为这本书的一个<strong>新文件</strong>挂上去，原文件保持不变。因此转错了可以直接删掉新文件，不存在「转坏一本」的风险。</p>

<h2>没有 Calibre 会怎样</h2>
<p>转换按钮里只显示模块自己能做的目标格式。若某个组合需要 Calibre 而它不可用，接口会明确拒绝并说明原因，而不是给你一个损坏的文件。</p>
`
  },
  {
    title: '第十章 删除与回收站',
    body: `
<p class="lead">删书是不可避免的，误删也是。这一章的目的是让后者可以挽回。</p>

<h2>软删除</h2>
<p>在书架上删除一本书时，它并不会立刻消失，而是进入<strong>回收站</strong>。书与它的文件在数据库中一起被标记为已删除，因此书架、统计与搜索里都看不到它。</p>

<h2>回收站</h2>
<p>回收站里可以查看所有被删除的书，并有两种选择：</p>
<ul>
  <li><strong>恢复</strong>：书回到书架，连同它的文件、封面、批注与阅读进度一起回来；</li>
  <li><strong>彻底删除</strong>：从数据库移除记录。这一步只能由管理员执行，因为它不可撤销。</li>
</ul>

<h2>批量操作</h2>
<p>书架的批量模式可以一次勾选多本书，统一删除或恢复。批量的语义是「尽力而为」：不属于你的书不会让整批失败，而是被跳过并在结果里列出，避免一次误操作影响全局。</p>

<h2>所有人的书，还是我的书</h2>
<p>图书馆的权限模型基于<strong>所有权</strong>而不是角色矩阵：</p>
<table>
  <tr><th>操作</th><th>谁能做</th></tr>
  <tr><td>阅读公开书籍</td><td>所有登录用户</td></tr>
  <tr><td>阅读私有书籍</td><td>所有者、管理员</td></tr>
  <tr><td>修改 / 删除书籍</td><td>所有者、管理员</td></tr>
  <tr><td>彻底删除</td><td>仅管理员</td></tr>
</table>
<p>这样设计的原因是：私人图书馆通常不是「一个人管所有书」，而是「每个人管自己的书，但可以互相借阅」。</p>

<h2>文件真的被删了吗</h2>
<p>软删除只是标记；彻底删除会移除数据库记录。如果你希望磁盘上的文件也被清理，需要由运维在确认后处理存储目录——模块刻意不代劳，避免一次误操作同时抹掉数据库与磁盘两处的证据。</p>
`
  },
  {
    title: '第十一章 后台与配置',
    body: `
<p class="lead">这一章面向部署者：模块在宿主后台留下了什么，以及哪些开关值得调整。</p>

<h2>后台数据表</h2>
<p>模块的所有表都注册进了宿主的通用后台（增删改查 + 侧边栏菜单），包括相对重要的：</p>
<ul>
  <li><code>lib_books</code> 书籍、<code>lib_book_files</code> 文件；</li>
  <li><code>lib_categories</code> 分类、<code>lib_authors</code> 作者、<code>lib_series</code> 系列、<code>lib_publishers</code> 出版社；</li>
  <li><code>lib_collections</code> 书单、<code>lib_collection_books</code> 书单条目；</li>
  <li><code>lib_reading_progress</code> 阅读进度；</li>
  <li><code>lib_bookmarks</code> 书签、划线、笔记；</li>
  <li><code>lib_book_chapters</code> 章节全文索引；</li>
  <li><code>lib_favorites</code> 收藏。</li>
</ul>
<p>连接表（作者关系、文件、书单条目等）同样注册了，方便排查，但没有放进侧边栏菜单。</p>

<h2>配置项一览</h2>
<table>
  <tr><th>键</th><th>默认</th><th>作用</th></tr>
  <tr><td><code>library.enabled</code></td><td>true</td><td>模块总开关；关闭后模块完全不注册任何东西</td></tr>
  <tr><td><code>library.clearSiteNavigation</code></td><td>true</td><td>接管首页时清空宿主导航</td></tr>
  <tr><td><code>library.maxFileSizeMB</code></td><td>200</td><td>单个电子书文件的大小上限</td></tr>
  <tr><td><code>library.douban.*</code></td><td>—</td><td>豆瓣元数据抓取（开关、地址、Cookie、超时）</td></tr>
  <tr><td><code>library.converter.*</code></td><td>—</td><td>格式转换（开关、Calibre 路径、超时）</td></tr>
</table>
<p>这些配置只在首次启动时写入默认值；之后管理员在后台的修改会被保留。</p>

<h2>存储与安全</h2>
<ul>
  <li>电子书文件存放在宿主统一的存储目录里，按内容哈希命名，重复上传同一份文件不会重复占用空间；</li>
  <li>电子书<strong>不</strong>经过宿主的公开文件路由，只能通过模块自己的鉴权接口下载；</li>
  <li>封面图片会额外登记为宿主文件，以便书架直接渲染；</li>
  <li>抓取豆瓣时，出站请求会先做地址安全校验，默认拒绝内网与保留地址，防止被用作探测内网的工具。</li>
</ul>

<h2>多语言</h2>
<p>界面提供简体中文、繁体中文与英文三套文案，跟随宿主的语言设置切换。</p>
`
  },
  {
    title: '第十二章 常见问题',
    body: `
<p class="lead">把事情说清楚，比什么都重要。以下是使用中最容易遇到的情况。</p>

<h2>详情页显示「文件缺失」</h2>
<p>说明数据库里登记了这个文件，但磁盘上找不到它。可能是手动清理存储目录、迁移时漏拷、或容器卷没挂上。解决办法：点击<strong>补充文件</strong>重新上传一份，挂到同一本书上。阅读进度、书签、划线都会保留。</p>

<h2>点在线阅读提示「该格式无法在浏览器中直接阅读」</h2>
<p>这个格式既不是 EPUB，也不是浏览器能直接渲染的 PDF／文本。先去详情页把它转换成 EPUB，或者下载后用本地阅读器打开。</p>

<h2>为什么首页变成了书架</h2>
<p>这是模块的设计：启用后它接管站点根路径。想改回去，把 <code>library.clearSiteNavigation</code> 设为 false，或直接关闭 <code>library.enabled</code>。</p>

<h2>为什么顶部的导航不见了</h2>
<p>同样是接管首页的一部分：书架自带分区导航。若要保留宿主导航，把 <code>library.clearSiteNavigation</code> 设为 false。</p>

<h2>翻页时右边露出一条下一页的文字</h2>
<p>这是分页排版里最典型的错误：相邻页在排版上是相邻的栏，如果栏间距小于页边距，下一页就会从边距里露出几个像素。本模块把栏间距的下限设为页边距本身，从根上避免了它。</p>

<h2>滚动模式下正文太宽</h2>
<p>滚动版面提供了独立的<strong>页宽</strong>设置；分页与双页模式下页宽由窗口决定，因为一页必须刚好占满一屏。想控制行宽可以缩小窗口，或切换到滚动模式再调页宽。</p>

<h2>划线的位置偏了</h2>
<p>划线记录的是字符区间。如果同一本书的文件被换成了另一版文字（例如换了一个校对版本），旧区间就可能对不上。此时删掉旧划线重新标记即可。</p>

<h2>朗读没有声音</h2>
<p>按顺序检查：系统是否安装了语音包；浏览器是否允许自动播放；是否先点击过一次页面。语音合成完全依赖浏览器，服务端不参与。</p>

<h2>搜索不到刚上传的书</h2>
<p>EPUB 上传时会自动建索引；如果索引当时失败（例如文件损坏），第一次搜索会重新尝试。若仍搜不到，检查这本书是否只有 PDF——PDF 不参与全文索引。</p>

<h2>写在最后</h2>
<p>这套模块遵循一个朴素的判断：<strong>私人图书馆的核心不是「存放」，而是「重读」</strong>。因此划线、笔记、进度、书签与搜索被放在了和上传同等重要的位置。愿你的书架上，不只是书。</p>
`
  }
]

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&apos;'
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char => XML_ESCAPE[char] ?? char)
}

function chapterDocument(chapter: TutorialChapter): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${TUTORIAL_LANGUAGE}" lang="${TUTORIAL_LANGUAGE}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${escapeXml(chapter.title)}</h1>
${chapter.body.trim()}
</body>
</html>`
}

/**
 * Package the tutorial into an EPUB 3 container (dependency-free, via the module's
 * own ZIP writer). `mimetype` must come first and uncompressed.
 */
export function buildTutorialEpub(): Buffer {
  const chapters = TUTORIAL_CHAPTERS
  const spine = chapters.map((_, index) => `<itemref idref="ch${index + 1}"/>`).join('\n    ')
  const manifest = chapters
    .map((_, index) => `<item id="ch${index + 1}" href="ch${index + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const navItems = chapters
    .map((chapter, index) => `<li><a href="ch${index + 1}.xhtml">${escapeXml(chapter.title)}</a></li>`)
    .join('\n        ')

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${TUTORIAL_LANGUAGE}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:library-guide-0001</dc:identifier>
    <dc:title>${escapeXml(TUTORIAL_TITLE)}</dc:title>
    <dc:creator>${escapeXml(TUTORIAL_AUTHOR)}</dc:creator>
    <dc:language>${TUTORIAL_LANGUAGE}</dc:language>
    <dc:description>${escapeXml(DESCRIPTION)}</dc:description>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${TUTORIAL_LANGUAGE}" lang="${TUTORIAL_LANGUAGE}">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
        ${navItems}
    </ol>
  </nav>
</body>
</html>`

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

  return createZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'ascii') },
    { name: 'META-INF/container.xml', data: Buffer.from(container, 'utf8') },
    { name: 'OEBPS/content.opf', data: Buffer.from(opf, 'utf8') },
    { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav, 'utf8') },
    { name: 'OEBPS/style.css', data: Buffer.from(CSS, 'utf8') },
    { name: 'OEBPS/cover.svg', data: Buffer.from(COVER_SVG, 'utf8') },
    ...chapters.map((chapter, index) => ({
      name: `OEBPS/ch${index + 1}.xhtml`,
      data: Buffer.from(chapterDocument(chapter), 'utf8')
    }))
  ])
}
