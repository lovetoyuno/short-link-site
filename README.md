# 短链接管理站（Cloudflare Pages + D1，纯网页部署，无需命令行）

一个可自行部署到 Cloudflare 的短链接管理平台，界面和功能参考截图中的“短链接”仪表盘：

- 创建短链接（自定义短码 / 自动生成）
- 批量创建
- 点击量统计 与 二维码扫描统计（区分普通点击与扫码访问）
- 密码保护链接（访问时需输入密码）
- 定时链接（设置生效时间 / 过期时间）
- 归档 / 删除链接
- 自定义域名管理（元数据记录，实际域名绑定需在 Cloudflare 控制台操作，见下文）
- 仪表盘统计卡片（有效链接 / 总点击量 / 二维码扫描 / 密码保护）
- **不限制用量**：创建链接数、自定义短码数、修改目标地址次数均无上限

## 技术方案（纯网页部署）

本项目使用 **Cloudflare Pages**（而非单独的 Workers 项目），因为 Pages 支持完全通过网页控制台 + GitHub 网页版来部署，不需要在电脑上安装 Node.js 或运行任何命令（包括 `wrangler deploy`）。

- **前端静态页面**：`public/` 目录，Cloudflare 自动直接发布
- **后端接口**：`functions/` 目录（Cloudflare Pages Functions，本质上就是运行在边缘的 Worker 代码，但无需 wrangler 就能随项目一起自动部署）
- **数据库**：Cloudflare D1（SQLite，免费额度充足），建库、建表、绑定均可在网页控制台完成
- **二维码**：调用免费的第三方 QR 生成接口（详见本文“关于二维码”一节）

## 部署步骤（全程网页操作，无需安装任何软件）

整体思路：先把项目代码上传到 GitHub（用网页拖拽上传，不需要 git 命令），然后在 Cloudflare 控制台里把这个仓库“连接”到一个 Pages 项目，之后每次修改代码都只需在 GitHub 网页上更新文件，Cloudflare 会自动重新部署。

### 第 1 步：把项目上传到 GitHub（纯网页操作）

1. 注册 / 登录 GitHub（github.com）。
2. 点击右上角 **New repository** 新建一个仓库，任意起名（比如 `short-link-site`），可选 Private，创建时不要勾选 “Add a README file”。
3. 进入新仓库页面，点击 **uploading an existing file**（或者之后在仓库页 **Add file → Upload files**）。
4. 把解压后的整个项目文件夹里面的**所有文件和子文件夹**（`functions/`、`public/`、`schema.sql`、`package.json`、`README.md`）一起拖拽到上传区域（现代浏览器支持直接拖拽整个文件夹，GitHub 会保留目录结构）。
5. 拉到页面底部，点击 **Commit changes** 完成上传。

### 第 2 步：在 Cloudflare 创建 D1 数据库（控制台操作）

1. 登录 Cloudflare 控制台，左侧菜单进入 **Workers & Pages → D1 SQL Database**（或搜索 “D1”）。
2. 点击 **Create database**，输入名称比如 `shortlinks`，创建。
3. 进入刚创建的数据库，切换到 **Console**（控制台/查询）标签页。
4. 打开项目中的 `schema.sql` 文件，全选复制其中内容，粘贴到 Console 的输入框中，点击执行（Execute / Run），建好 `links`、`clicks`、`domains` 三张表。

   > ⚠️ **如果提示 “Requests without any query are not supported”**：说明粘贴时换行被压成了一行（或浏览器/输入框没保留换行），导致整段 SQL 只剩一行。解决方法：
   > 1. 先尝试重新粘贴一次（目前的 `schema.sql` 已经删去了开头的 `--` 注释行，避免它把后面内容一并注释掉）；
   > 2. 若仍失败，可以把三个 `CREATE TABLE ...` 语句（以分号 `;` 为分割）拆开，**一次只粘贴并执行一个语句**，依次建完 `links`、`clicks`、`domains` 三张表和对应的 `CREATE INDEX` 语句（共 6 次）。

### 第 3 步：在 Cloudflare 创建 Pages 项目并连接 GitHub（控制台操作）

1. 左侧菜单 **Workers & Pages → Overview**，点击 **Create**。
2. 选择 **Pages** 选项卡 → **Connect to Git**，授权并选择你刚刚上传的 GitHub 仓库。
3. 构建设置保持默认即可：
   - Framework preset：选 **None**
   - Build command：留空
   - Build output directory：填 `public`
4. 点击 **Save and Deploy**，Cloudflare 会自动拉取仓库并部署，稍等片刻后会得到一个 `https://xxx.pages.dev` 地址。

### 第 4 步：绑定 D1 数据库到 Pages 项目（控制台操作）

1. 进入刚创建的 Pages 项目 → **Settings → Functions**，找到 **D1 database bindings**。
2. 点击 **Add binding**，Variable name 填 `DB`（必须一模一样，代码里使用的就是 `env.DB`），D1 database 选择之前创建的 `shortlinks`，保存。
3. （可选）同一页面可以在 **Environment variables** 中添加 `BASE_SHORT_DOMAIN`，值填你的自定义域名（比如 `s.yourdomain.com`，不带协议头或带 `https://` 都可）。留空则自动使用 Pages 分配的域名。
4. 返回 **Deployments** 页，对最新一次部署点 **Retry deployment**（添加绑定后需重新部署一次才会生效）。
5. 部署完成后，打开 `https://xxx.pages.dev` 即可看到仪表盘，尝试创建一条短链接验证。

之后如果需要修改代码，只需在 GitHub 网页上编辑/重新上传对应文件并 Commit，Cloudflare Pages 会自动检测到更新并重新部署，全程不需要任何命令行操作。

## 绑定自定义域名（例如 s.yourdomain.com，控制台操作）

1. 先将域名接入 Cloudflare（或使用已接入域名的子域名）。
2. 进入 Pages 项目 → **Custom domains** → **Set up a custom domain**，输入 `s.yourdomain.com`。
3. Cloudflare 会自动创建 DNS 记录并颁发证书，生效后该域名就会直接指向本项目。
4. 回到仪表盘点击“域名”，添加相同域名并标记为已生效，仅用于在面板中展示，不影响实际路由。
5. 建议把第 4 步中的 `BASE_SHORT_DOMAIN` 环境变量更新为该自定义域名并重新部署，这样新创建的短链接会使用该域名作为前缀。

> 注意：不同域名下创建的短码共享同一个数据库，如需按域名隔离短码空间，可在 `schema.sql` 中将 `code` 的唯一约束改为 `(code, domain)` 联合唯一，并相应调整 `functions/_shared.js` 中的查询逻辑。

## 关于用量限制

本站不设置任何用量上限：创建链接数量、自定义短码数量、修改目标地址的次数都不受限。仪表盘侧边栏只会展示统计数字（供参考），不会阻止任何操作。唯一的技术性保护是单次批量创建最多 200 条（防止单次请求过大超时，不是套餐限制），如需调整可修改 `functions/_shared.js` 中 `apiBatchCreate` 里的 `200` 这个数字。

## 关于二维码

为了避免自己实现 QR 编码算法，项目默认调用了一个免费的第三方 QR 生成接口（api.qrserver.com）来把短链接地址转换为图片。这意味着生成二维码时，短链接地址会发送给这个第三方服务。如介意隐私或需要完全离线，可以：

- 替换为其他 QR API（修改 `functions/_shared.js` 中 `qrImageUrl` 的拼接逻辑），或
- 集成一个纯 JS 的 QR 编码库在 Function 内本地生成 SVG/PNG。

扫描统计原理：仪表盘生成的二维码实际编码的是 `短链接?src=qr`，访问时 Function 会识别到 `src=qr` 并单独计入“二维码扫描”计数，同时仍然计入总点击量。

## 目录结构

```
short-link-site/
├─ package.json
├─ schema.sql              # D1 数据库结构，在 D1 控制台 Console 中粘贴执行即可
├─ functions/
│  ├─ _shared.js           # 所有后端逻辑：API、短码重定向、密码验证、点击/扫码记录
│  ├─ [code].js             # 处理 /任意短码 的重定向
│  └─ api/
│     └─ [[path]].js       # 处理 /api/* 的所有接口
└─ public/
   ├─ index.html           # 仪表盘页面
   ├─ styles.css
   └─ app.js               # 前端交互逻辑（调用 /api/*）
```

> 本项目使用 Cloudflare Pages + Pages Functions，所以不需要 `wrangler.toml`，所有��定（D1、环境变量）都在网页控制台的 Settings 里配置。

## 已知限制 / 后续可扩展

- 当前未包含登录/多用户体系，适合个人或小团队内部使用。如需对外开放注册，建议加一层登录鉴权（可用 Cloudflare Access 或自建登录）。
- 点击统计目前只记录总量、是否来自二维码、Referer、国家（由 Cloudflare `request.cf.country` 提供）、User-Agent；如需更细致的时间趋势图可基于 `clicks` 表自行扩展查询。
- 本站无任何付费套餐或用量限制，如需重新引入限额或付费功能，可自行在 `functions/_shared.js` 中添加相应检查逻辑。
