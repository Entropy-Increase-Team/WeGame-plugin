# WeGame-plugin

基于 Yunzai 的 WeGame 平台插件。

当前定位是 WeGame 核心能力层，负责统一提供：

- WeGame QQ / 微信扫码登录
- WeGame 账号绑定与切换
- 外置游戏模块自动发现与加载
- 核心帮助页与模块帮助聚合

游戏查询能力不直接堆在核心层里，而是放到各自的游戏模块中。

## 下载

```bash
git clone https://github.com/Entropy-Increase-Team/WeGame-plugin.git ./plugins/WeGame-plugin
```

## 配置说明

### 1. WeGame 核心配置

默认配置文件：

- wgconfig_default.yaml

实际使用配置：

- wgconfig.yaml

核心字段：

- `wegame.base_url`：后端地址
- `wegame.api_key`：WeGame 核心层 API Key，作用域必须是 `wegame`
- `wegame.client_type`：建议填 `bot`
- `wegame.client_id`：机器人实例标识
- `wegame.device_fingerprint`：设备指纹，可留空自动生成

说明：

- 首次载入插件时，如果 `config/config/wgconfig.yaml` 不存在，会自动从默认配置创建
- 如果 `wegame.api_key` 留空，插件会自动尝试匿名令牌登录链路
- 但账号列表、切换账号、删除账号这类账号管理功能需要 `wegame.api_key`
- 模块资源仓库地址不再走配置文件，已在代码中固定为 `https://github.com/Entropy-Increase-Team/WeGame-GameModules`

### 2. 游戏模块配置

以 `rocom` 为例：

- 模块默认配置：config_default.yaml
- 用户配置：rocom.yaml

说明：

- 每个游戏模块都使用自己的 API Key
- 不要把游戏模块 API Key 填到核心层 `wegame.api_key`
- 模块首次读取配置时，如果用户配置不存在，会根据模块自己的默认配置自动生成

### 3. 帮助配置

核心帮助默认配置：

- help_default.yaml

用户自定义核心帮助：

- `config/config/help.yaml`

模块帮助默认配置：

- `modules/<module>/defSet/<module>_help_default.yaml`

模块帮助自定义覆盖：

- `config/config/games/<module>_help.yaml`

说明：

- `=帮助` 会自动读取 WeGame 核心帮助
- 然后自动拼接当前已安装模块的帮助分组
- 模块帮助分组标题由模块自己的默认帮助文件决定

## 命令说明

### WeGame 核心命令

- `=帮助`
- `=qq登陆`
- `=wx登陆`
- `=账号列表`
- `=切换账号 1`
- `=删除账号 1`

## 模块机制

核心插件会自动扫描 `modules/` 下所有带 `module.json` 的目录，并自动加载其中的：

- `apps/*.js`
- 模块默认帮助
- 模块默认配置

模块最少需要提供：

- `module.json`
- `apps/`

如果模块需要渲染图片，建议再提供：

- `resources/`
- `defSet/config_default.yaml`
- `defSet/<module>_help_default.yaml`

模块仓库约定：

- 模块总仓库固定为 `https://github.com/Entropy-Increase-Team/WeGame-GameModules`
- 默认分支固定为 `main`
- `main` 分支对应本地的 `modules/WeGame-GameModules/`
- 各游戏模块使用独立分支
- 分支名与模块名保持一致，例如 `rocom` 模块使用 `rocom` 分支

## 目录结构

```text
WeGame-plugin/
├─ apps/                       # WeGame 核心命令
├─ config/
│  ├─ wgconfig_default.yaml    # WeGame 核心默认配置
│  ├─ help_default.yaml        # WeGame 核心默认帮助配置
│  └─ config/
│     ├─ wgconfig.yaml         # 用户自己的核心配置
│     └─ games/
│        └─ <module>.yaml      # 各游戏模块自己的用户配置
├─ model/                      # 核心请求、账号、模块加载逻辑
├─ resources/                  # WeGame 核心帮助渲染资源
├─ modules/                    # 外置游戏模块目录
│  └─ rocom/                   # 示例游戏模块
│     ├─ apps/                 # 模块命令
│     ├─ defSet/               # 模块默认配置 / 默认帮助
│     ├─ model/                # 模块请求层
│     ├─ resources/            # 模块自己的渲染资源
│     ├─ utils/                # 模块工具函数
│     └─ module.json           # 模块元数据
└─ utils/                      # 核心配置、帮助、命令工具
```
