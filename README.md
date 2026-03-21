# miuix-mcp

一个基于 Model Context Protocol (MCP) 的 `stdio` 服务器，用于检索 Miuix 组件文档、示例代码、示例工程目录与 Dokka API。适用于支持 MCP 的客户端。

## 快速开始

- 安装依赖：
  - 安装 Bun
  - 在项目根目录执行：

    ```bash
    bun install
    ```

- 手动运行：
  - 在项目根目录执行：

    ```bash
    bun run src/index.ts
    ```

## 客户端配置

在支持 MCP 的客户端中，将本服务注册为 `stdio` 服务器。参考以下配置：

```json
{
  "mcpServers": {
    "miuix-mcp": {
      "command": "bun",
      "args": [
        "run",
        "path/miuix-mcp/src/index.ts"
      ]
    }
  }
}
```

- 可选：通过命令行参数覆盖文档地址（适合本地文档预览）
  - 在 `args` 末尾追加：`"--docs-url=http://localhost:5173/miuix/"`
- 可选：通过环境变量覆盖文档地址
  - 设置 `MIUIX_DOCS_URL`，默认值为 `https://compose-miuix-ui.github.io/miuix`

## 可用工具

### 基础与版本

- `get_latest_version` 获取 miuix 库最新发布版本（GitHub Releases）
- `get_gradle_dependency` 获取 Gradle 依赖配置代码片段（支持 `miuix`、`miuix-icons`、`miuix-navigation3-ui` 以及 KMP、Android 和其他单平台）

### 组件文档与示例

- `get_all_components` 列出所有组件（解析文档 `/components/` 页面）
- `search_components` 按名称检索组件（基于 `get_all_components`）
- `get_component_doc` 获取指定组件的 Markdown 文档
- `get_component_demo` 获取指定组件的示例 Kotlin 代码

### 开发指南

- `list_guides` 列出所有 guide 页面
- `get_guide_doc` 按 slug 获取 guide 文档
- `get_quick_start_doc` 获取“快速开始”指南
- `get_theme_doc` 获取“主题”指南
- `get_colors_doc` 获取“颜色系统”指南
- `get_text_styles_doc` 获取“文本样式”指南
- `get_icons_doc` 获取“图标”指南
- `get_utils_doc` 获取“工具类”指南
- `get_navigation3_doc` 获取“Navigation3 支持”指南
- `get_multiplatform_doc` 获取“多平台支持”指南
- `get_best_practices_doc` 获取“最佳实践”指南

### API 参考 (Dokka)

- `list_dokka_packages` 列出 Dokka API 文档中的所有包
- `list_dokka_package_items` 列出指定包中的类、函数与属性
- `search_dokka` 搜索 Dokka API 文档中的包与符号

### 示例工程

- `list_example_tree` 递归列出仓库 `example/` 目录树
- `list_example_path` 列出 `example/` 子路径下的文件与目录
- `get_example_file` 获取指定示例文件源码文本

## 缓存与持久化

- 缓存目录：`.cache/miuix-mcp`
- 策略：内存 > 磁盘 > 网络，网络失败时回退到可用的陈旧缓存
- 默认 TTL：
  - `latestRelease` 6 小时
  - `components` 2 小时
  - `componentDoc`/`componentDemo` 12 小时
  - `guideDoc` 12 小时
  - `dokkaPackages`/`dokkaPackageSymbols`/`dokkaClassMembers` 6 小时
  - `examplePath` 2 小时
  - `exampleFile` 24 小时
  - `exampleTree` 6 小时

## 目录结构

- `src/index.ts` MCP 服务器入口（`stdio`）
- `src/tools.ts` 工具注册
- `src/api.ts` 数据源访问与解析
- `src/config.ts` 配置（文档 URL、命令行覆盖）
- `src/cache.ts` 持久缓存层
