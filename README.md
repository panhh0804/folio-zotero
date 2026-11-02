# Folio for Zotero

Semantic highlighting, persistent margin labels, and on-demand translation for Zotero.

Folio 在 Zotero 原生 PDF 阅读器中提供语义高亮和页边标签，支持人工标注、AI 草稿审核，以及标注卡片内的按需翻译。

当前版本：**0.3.3**。已测试环境：**macOS / Zotero 10.0.7**。

## 功能

- 人工标注优先，支持六类语义分类：MOTV、PROB、INSG、SOLN、RSLT、LIMT。
- 根据高亮颜色映射分类，并保存为 Zotero 原生批注和标签。
- 页边标签持续显示，随 PDF 页面缩放和旋转更新；切换高亮或收起面板后保留。
- AI 全文筛选和分类，生成草稿，审核后保存；重复保存会进行去重。
- 可拖动、调整大小的浮动面板，支持收起为小窗。
- 与 Translate for Zotero 共用选词弹窗；卡片提供「翻译／收起译文／显示译文」。
- 支持评论、分类配置导入导出，以及 Markdown 精读笔记导出。

| 分类 | 含义 | 默认高亮颜色 |
| --- | --- | --- |
| MOTV | 研究动机 | `#FFD400` |
| PROB | 研究问题 | `#F19837` |
| INSG | 关键洞察 | `#FF6666` |
| SOLN | 解决方案 | `#2EA8E5` |
| RSLT | 实验结果 | `#5FB236` |
| LIMT | 研究局限 | `#A28AE5` |

## 构建与安装

需要 Node.js 20 或更新版本，以及 Python 3。当前没有需要安装的 npm 依赖。

```sh
git clone https://github.com/panhh0804/folio-zotero.git
cd folio-zotero
npm run check
npm test
npm run build
```

构建结果为 `dist/Folio-0.3.3.xpi`。在 Zotero 中打开「工具 → 插件」，点击齿轮，选择「从文件安装插件」，选中 XPI 文件。

打开 PDF 后，点击工具栏中的 Folio。人工标注可直接使用；AI 分析需要自行配置模型服务。点击面板标题栏的减号可收起为小窗，拖动底角可调整大小。

## AI 配置

支持 Ollama 和 OpenAI 兼容接口。

- Ollama 默认地址：`http://127.0.0.1:11434`。这只是连接默认值，不会自动安装 Ollama 或下载模型。
- 默认模型名为 `qwen3:8b`，请改为自己的服务中可用的模型。
- OpenAI 兼容接口填写 API 根地址（通常以 `/v1` 结尾）、模型名和 API Key。
- 使用远程服务需要主动开启「允许向远程服务发送当前论文文本」；远程接口要求 HTTPS。
- API Key 仅保留在当前阅读会话内存中，不写入 Folio 配置文件。

模型接收句子 ID、当前 PDF 的相关文本与分类定义，返回分类结果。页码和几何坐标来自 Zotero 的字符流。AI 结果先进入草稿，用户确认后才保存。

## 翻译

卡片翻译需要安装并配置 [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate)。已进行联动验证的版本为 2.4.8。

在某条标注下点击「翻译」，Folio 会通过该插件的公开 API 调用当前选定的翻译服务，并在卡片内显示译文。重复展开使用当前阅读会话的缓存；译文不会覆盖原文和个人评论。服务响应时间取决于所选翻译服务。

## 数据与隐私

- 不修改原始 PDF，不直接读写 Zotero SQLite 数据库，不建立独立云端文献库。
- 正式标注使用 Zotero 原生高亮和 `semantic:*` 标签保存，可随原生批注同步。
- 草稿保存在本机插件偏好中，不作为正式批注同步。
- 页边标签是动态显示层，不会写入 PDF；禁用插件后仍保留原生高亮。
- 本仓库仅包含发布源码、合成数据测试和构建脚本。测试文献库、浏览器配置、日志、本机自动化脚本与生成的安装包均不纳入版本控制。

## 开发

```text
bootstrap.js             插件生命周期
manifest.json            Zotero 插件清单
src/core.js              分类、句子定位、去重和笔记导出
src/plugin.js            Zotero 阅读器、原生批注和模型适配
src/panel.js             浮动面板与标注卡片
src/translation.js       按需翻译与会话缓存
src/style.css            界面样式
scripts/build.py         白名单打包 XPI
scripts/package-source.py 仅打包 Git 跟踪的公开源码
scripts/audit-public.py  发布文件脱敏检查
tests/                   不依赖私人文献库的自动化测试
```

```sh
npm run check
npm test
npm run build
python3 scripts/audit-public.py
```

当前发布采用手动安装更新。Zotero 10 的清单要求 `update_url`，因此使用保留域名 `folio.invalid` 作为占位地址；目前没有在线自动更新服务。

## 当前限制

- 扫描版 PDF 需要先在外部完成 OCR。
- 字符坐标和页面显示层依赖部分 Zotero 内部接口，升级 Zotero 后需要回归验证。
- 复杂公式、特殊双栏排版与跨页段落可能影响选句和定位，AI 草稿需要人工审核。
- 首期页边标签位于页面左侧，不为双栏分别设置标签栏；密集标签会向下堆叠。
- 超长文献的最终全局筛选受模型上下文窗口限制。
- 尚不包含文献库批量分析、带页边标签的 PDF 导出、可视化分类配置编辑器和原生撤销栈集成。

## 许可证

[MIT](LICENSE)。未复用第三方 Zotero 插件实现代码；Translate for Zotero 通过运行时公开 API 调用，其代码与安装包不包含在本仓库中。
