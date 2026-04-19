# WeGame-plugin
# 前端正在制作
# 测试APIKEY： sk-f9a97f99fed455ae910d028edc172078

适用于 Yunzai 的 WeGame 核心插件。

它不是某一个单独游戏的数据插件，而是 WeGame 的统一能力层，主要负责：

- QQ / 微信扫码登录 WeGame
- WeGame 账号绑定、切换、删除
- 游戏模块自动发现、下载、加载
- 核心帮助页与模块帮助聚合

具体游戏查询能力由各自模块负责。

> [!TIP]
> `=账号列表` 查看的是 WeGame 绑定账号列表。
> 游戏自己的角色列表，请使用对应模块命令。
> 例如安装 `rocom` 后，游戏侧账号列表使用的是 `+账号列表`。

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

推荐顺序：

1. 配置 `config/config/wgconfig.yaml`
2. 发送 `=qq登陆` 或 `=wx登陆`
3. 发送 `=账号列表` 确认绑定是否正常
4. 发送 `=模块` 查看可下载模块
5. 发送 `=模块下载 rocom` 下载目标模块

## 常用命令

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

## 已有模块

当前仓库内已提供的模块：

### `rocom`

- 模块名：洛克王国世界
- 本地目录：`plugins/WeGame-plugin/modules/rocom`
- 模块分支：`rocom`
- 仓库跳转：<https://github.com/Entropy-Increase-Team/WeGame-GameModules/tree/rocom>
- 当前能力：档案、战绩、精灵列表、阵容、交换大厅、尺寸查询、查蛋、配种、远行商人、远行商人订阅

## 模块仓库

模块统一来源于：

- 模块仓库主页：<https://github.com/Entropy-Increase-Team/WeGame-GameModules/tree/main>
- `rocom` 模块分支：<https://github.com/Entropy-Increase-Team/WeGame-GameModules/tree/rocom>

说明：

- `main` 用来查看模块仓库总览
- 每个具体游戏模块使用独立分支
- 分支名和模块名保持一致
- 例如 `=模块下载 rocom` 对应拉取 `rocom` 分支

## 配置文件

- 核心默认配置：`config/wgconfig_default.yaml`
- 核心用户配置：`config/config/wgconfig.yaml`
- 游戏模块用户配置：`config/config/games/<module>.yaml`
- 核心 API 文档：`WeGame-API.md`

## 说明

- 本插件只负责 WeGame 核心能力与模块管理，不直接承载所有游戏业务
- 某个游戏查不到数据时，优先确认对应模块是否已安装、是否具备权限、是否存在可用 WeGame 绑定
