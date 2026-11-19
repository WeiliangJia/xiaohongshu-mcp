# xiaohongshu-mcp

在 Codex 桌面版输入 `@`，选择 `xiaohongshu-mcp`，就能用自己的小红书账号搜索笔记、打开原帖和整理内容。第一次需要安装和扫码，平时直接在对话里使用。

> @xiaohongshu-mcp 搜索「悉尼咖啡店」，打开 5 篇相关笔记，告诉我店名、推荐饮品和原帖链接。

## 1. 准备软件和项目文件

- 安装 **ChatGPT 桌面应用（含 Codex）**，登录后确认能打开 Codex。查询时请选择本机对话。
- 安装 **Node.js 22 或更新版本**。从 [Node.js 官网](https://nodejs.org/) 下载 LTS 安装程序，使用默认安装选项。它会一并安装后面要用的 `npm` 和 `npx`。
- 已经克隆仓库的用户直接打开克隆得到的文件夹。也可以在 GitHub 仓库页面点 **Code → Download ZIP**，解压后打开能看到本 README 和 `package.json` 的文件夹。

## 2. 在项目文件夹里打开终端

终端是粘贴命令的窗口。每次复制一行，按回车，等命令完成后再执行下一行。

**Windows** 在文件资源管理器打开项目文件夹，点顶部地址栏，输入 `powershell` 并按回车。这会在当前文件夹打开 PowerShell。运行 `dir`，确认列表里有 `package.json`。

**macOS 或 Linux** 打开终端，输入 `cd `（末尾带空格），把项目文件夹拖到终端里。文件夹路径出现后按回车。运行 `ls`，确认列表里有 `package.json`。如果拖动不方便，也可以输入 `cd "项目文件夹的完整路径"`，把引号内的文字换成自己的路径。

检查工具是否可用。两个命令都应显示版本号，Node.js 应为 `v22` 或更高。

```text
node --version
codex --version
```

如果 `node` 无法识别，安装 Node.js 后重新打开终端。如果 `codex` 无法识别，执行下面对应系统的命令安装 Codex 命令行，再关闭并重新打开终端，重试 `codex --version`。

| 系统 | 安装 Codex 命令行 |
|---|---|
| Windows PowerShell | `npm.cmd install -g @openai/codex` |
| macOS 或 Linux | `npm install -g @openai/codex` |

## 3. 安装插件并扫码

**Windows PowerShell**

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run setup
npm.cmd run login
codex plugin marketplace add .
codex plugin add xiaohongshu-mcp@xiaohongshu-local
```

**macOS 或 Linux**

```sh
npm ci
npx playwright install chromium
npm run setup
npm run login
codex plugin marketplace add .
codex plugin add xiaohongshu-mcp@xiaohongshu-local
```

- 第二行会下载专用浏览器，首次下载可能需要几分钟。
- 执行 `run login` 时，新开的 Chromium 窗口会显示小红书。用自己的小红书 App 扫码并确认登录。网页显示已登录后，关闭专用窗口。终端回到可以输入命令的状态后，再执行最后两行。
- `marketplace add .` 末尾的 `.` 代表当前项目文件夹。最后一行会把插件装入你本机的 Codex。登录信息保存在本机的专用浏览器配置里。

## 4. 在 Codex 里试一次

打开新的**本机 Codex 对话**，输入 `@`，输入 `xiaohongshu-mcp` 进行筛选，然后在菜单中点选插件。点选后输入问题，例如「搜索小红书上的悉尼咖啡店，打开 3 篇笔记，整理店名、推荐饮品和原帖链接」。第一次查询会启动本机服务。

以后使用时，直接在对话里点选插件即可。小红书提示登录失效时，在项目文件夹里重新运行登录命令，扫码后关闭专用窗口，再回到对话重试。

### 常见问题

| 你看到的情况 | 怎么处理 |
|---|---|
| `npm ci` 提示找不到 `package.json` | 返回第 2 步，从包含 `package.json` 的文件夹打开终端。下载 ZIP 的用户先解压。 |
| PowerShell 提示无法加载 `.ps1` 脚本 | 使用上面的 Windows 命令。若报错的是 `codex.ps1`，把安装命令里的 `codex` 换成 `codex.cmd`。 |
| `@` 菜单里找不到插件 | 运行 `codex plugin list --marketplace xiaohongshu-local`。看到已安装后，退出并打开桌面应用，再新开一个本机 Codex 对话。如果没有安装，从第 3 步最后两行开始重试。 |
| `LOGIN_REQUIRED` 或 `VERIFICATION_REQUIRED` | 运行 `npm.cmd run login`（Windows）或 `npm run login`（macOS/Linux），在专用浏览器里完成网站提示的操作，关闭窗口后再试。 |
| `PROFILE_BUSY` | 关闭用于扫码的专用窗口，等正在查询的请求结束，再重试。 |
| `BROWSER_NOT_INSTALLED` | 重新执行第 3 步的浏览器下载命令。Linux 如果提示缺少系统库，可运行 `npx playwright install --with-deps chromium`。 |
| `PAGE_CHANGED` | 可以在 GitHub 提交问题，附上错误码和触发步骤。分享前去掉个人信息和凭据。 |
| 移动了项目文件夹 | 在新位置运行 `npm.cmd run setup`（Windows）或 `npm run setup`（macOS/Linux），然后重新打开 Codex 对话。 |

## 给其他工作流使用

在项目文件夹里运行 `npm.cmd run serve`（Windows）或 `npm run serve`（macOS/Linux）并保持终端打开。Codex 已经启动服务时，可以直接连现有服务。手动启动的服务可以用 `Ctrl+C` 停止，Codex 自动启动的服务在空闲五分钟后会退出。

- **传输** Streamable HTTP
- **地址** `http://127.0.0.1:17333/mcp`
- **鉴权** 在本机运行 `node src/main.mjs token`，把显示的值填入客户端的 Bearer Token 字段，或设置请求头 `Authorization: Bearer <本机访问令牌>`。请保管好令牌。

| MCP 工具 | 参数 | 返回的 `structuredContent` |
|---|---|---|
| `search_notes` | `keyword`、可选 `limit`（默认 5，上限 20） | `{ schemaVersion, notes }`，每项有 `id`、`title`、`author`、`url` |
| `get_note` | `url`，可以用搜索结果的链接或小红书分享短链 | `{ schemaVersion, id, url, title, author, text, publishedAt, likes, saves, comments }` |
| `check_follow` | `username`，博主的完整昵称 | `{ schemaVersion, username, following, label, url }`，从当前登录账号看到的主页按钮读取关注状态 |

网页未显示的字段为 `null`。`publishedAt` 保留网页上的日期文字，互动数可能由「1.2 万」之类的页面简写换算。工具失败时 `isError` 为 `true`，`content[0].text` 是包含 `code` 和 `message` 的 JSON。

## 登录信息放在哪里

Windows 默认在 `%LOCALAPPDATA%\xiaohongshu-mcp`，macOS 默认在 `~/Library/Application Support/xiaohongshu-mcp`，Linux 默认在 `$XDG_DATA_HOME/xiaohongshu-mcp`，未设置时在 `~/.local/share/xiaohongshu-mcp`。目录里包含登录会话和本机访问令牌，请保留在自己的电脑上。查询得到的笔记会返回给调用工具的客户端。网页能看到多少内容取决于小红书的页面和账号权限。
