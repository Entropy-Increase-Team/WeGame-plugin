# WeGame-plugin

适用于 Yunzai 的 WeGame 核心插件。

它的定位不是“某一个游戏的数据插件”，而是 WeGame 的统一能力层，主要负责：

- QQ / 微信扫码登录 WeGame
- WeGame 账号绑定、切换、删除
- 外置游戏模块自动发现、下载、加载
- 核心帮助页与模块帮助聚合

具体游戏的数据查询不直接写在核心层里，而是交给各自的游戏模块处理。

> [!TIP]
> `=账号列表` 查看的是 WeGame 绑定账号列表。
> 具体游戏的角色列表，请使用对应游戏模块自己的命令。
> 例如安装 `rocom` 模块后，游戏侧账号列表使用的是 `+账号列表`。

## 功能概览

- WeGame QQ / 微信扫码登录
- 多 WeGame 账号绑定与切换
- 游戏模块列表查询与远程下载
- 核心帮助菜单与模块帮助聚合
- 统一请求层、统一 API Key、统一配置读写

## 安装

### 1. 克隆插件

在 Yunzai 根目录执行：

```bash
git clone https://github.com/Entropy-Increase-Team/WeGame-plugin.git ./plugins/WeGame-plugin
```

### 2. 安装依赖

```bash
pnpm install --filter=wegame-plugin
```

### 3. 重启 Yunzai

安装完成后重启机器人即可。

## 快速开始

推荐按下面的顺序使用：

1. 安装并重启 `WeGame-plugin`
2. 配置后端地址和 `wegame.api_key`
3. 发送 `=qq登陆` 或 `=wx登陆`
4. 发送 `=账号列表` 确认 WeGame 绑定是否正常
5. 发送 `=模块` 查看可下载的游戏模块
6. 发送 `=模块下载 rocom` 之类的命令安装目标模块
7. 重启或重载插件后，再使用对应模块命令

## 配置说明

### 核心配置文件

- 默认配置：`config/wgconfig_default.yaml`
- 用户配置：`config/config/wgconfig.yaml`

首次载入插件时，如果 `config/config/wgconfig.yaml` 不存在，会自动根据默认配置创建。

### 核心配置项

| 配置项 | 说明 |
| --- | --- |
| `wegame.base_url` | WeGame 后端地址，结尾不要带 `/` |
| `wegame.api_key` | 开发者 WeGame API Key，作用域必须是 `wegame` |
| `wegame.client_type` | 第三方客户端类型，建议填写 `bot` |
| `wegame.client_id` | 当前机器人实例标识，可用于区分不同机器人 |
| `wegame.device_fingerprint` | 设备指纹，可留空自动生成 |
| `wegame.request_timeout_ms` | 请求超时，单位毫秒 |
| `wegame.login_poll_interval_ms` | 登录轮询间隔，单位毫秒 |
| `wegame.login_timeout_ms` | 等待扫码完成的超时时间，单位毫秒 |

### 核心配置说明

- 如果 `wegame.api_key` 留空，插件会尝试走匿名令牌链路
- 匿名模式可用于登录等基础链路，但账号列表、切换账号、删除账号等账号管理能力需要 `wegame.api_key`
- 游戏模块接口同样复用核心层的 `wegame.api_key`
- 如果某个游戏接口需要额外权限，还需要让这把 Key 先获批对应游戏权限
  - 例如 `rocom` 模块通常需要 `game:rocom` 下的 `rocom.access`

### 游戏模块配置

游戏模块自己的配置统一放在：

- `config/config/games/<module>.yaml`

以 `rocom` 为例：

- 模块默认配置：`modules/rocom/defSet/config_default.yaml`
- 用户配置文件：`config/config/games/rocom.yaml`

说明：

- 游戏模块不单独维护自己的 API Key
- 游戏模块业务配置只保留分页、展示之类的模块内部选项
- 实际请求认证仍然统一使用核心层的 `wegame.api_key`

### 帮助配置

- 核心帮助默认配置：`config/help_default.yaml`
- 核心帮助用户配置：`config/config/help.yaml`
- 模块帮助默认配置：`modules/<module>/defSet/<module>_help_default.yaml`
- 模块帮助用户覆盖：`config/config/games/<module>_help.yaml`

`=帮助` 会先读取核心帮助，再自动拼接当前已安装模块的帮助分组。

## 命令说明

### 核心命令

| 命令 | 说明 |
| --- | --- |
| `=帮助` | 查看 WeGame 核心帮助 |
| `=qq登陆` | 使用 QQ 扫码登录 WeGame |
| `=wx登陆` | 使用微信扫码登录 WeGame |
| `=账号列表` | 查看当前用户已绑定的 WeGame 账号 |
| `=切换账号 1` | 切换默认 WeGame 账号 |
| `=删除账号 1` | 删除指定 WeGame 绑定 |
| `=模块` | 查看已安装模块和远程可下载模块 |
| `=模块下载 <模块名>` | 下载指定游戏模块 |

### 关于账号列表

这里有两个概念很容易混：

- `=账号列表`：核心层命令，展示 WeGame 绑定账号
- 模块自己的账号列表：展示这个游戏能识别出来的角色或游戏账号

例如安装 `rocom` 后：

- `=账号列表` 看的是 WeGame 绑定
- `+账号列表` 看的是洛克王国世界角色账号

## 模块机制

核心插件会自动扫描 `modules/` 下所有带 `module.json` 的目录，并自动加载其中的：

- `apps/*.js`
- 模块默认帮助
- 模块默认配置

模块最少需要提供：

- `module.json`
- `apps/`

如果模块需要图片渲染，通常还会带上：

- `resources/`
- `defSet/config_default.yaml`
- `defSet/<module>_help_default.yaml`

## 模块仓库说明

当前模块远程仓库固定为：

- `https://github.com/Entropy-Increase-Team/WeGame-GameModules`

约定如下：

- 默认分支固定为 `main`
- `main` 分支对应本地的 `modules/WeGame-GameModules/`
- 每个游戏模块使用独立分支
- 分支名与模块名保持一致
- 例如 `rocom` 模块对应 `rocom` 分支

因此：

- `=模块` 会直接查询远程仓库分支
- `=模块下载 <模块名>` 会按模块名下载对应分支
- 下载完成后需要重启或重载插件，模块命令才会生效

## 模块示例

如果你安装了 `rocom` 模块，大致使用流程会是：

```text
=qq登陆
=账号列表
=模块下载 rocom
+帮助
+档案
+战绩
```

实际以模块自己的帮助说明为准。

## 目录结构

```text
WeGame-plugin/
├─ apps/                       # WeGame 核心命令
├─ config/
│  ├─ wgconfig_default.yaml    # 核心默认配置
│  ├─ help_default.yaml        # 核心默认帮助
│  └─ config/
│     ├─ wgconfig.yaml         # 用户核心配置
│     └─ games/
│        └─ <module>.yaml      # 各模块用户配置
├─ model/                      # 核心请求、账号、模块加载逻辑
├─ resources/                  # 核心帮助渲染资源
├─ modules/                    # 外置游戏模块目录
└─ utils/                      # 核心工具函数
```

## 相关文档

- 核心 API 文档：`WeGame-API.md`
- 模块 API 文档：各模块目录下的 `*-API.md`
- 示例模块说明：安装对应模块后查看其目录下的 `README.md`

## 说明

- 本插件只负责 WeGame 核心能力与模块管理，不直接承载所有游戏业务
- 如果你看到某个游戏查不到数据，优先确认该游戏模块是否已安装、是否具备对应权限、是否有可用的 WeGame 绑定
- 如果你要开发新游戏模块，建议直接复用本插件提供的统一登录、统一账号和统一请求层
