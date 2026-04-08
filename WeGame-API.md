# WeGame API

本文档描述共享 WeGame 登录层与平台侧接口，不包含具体游戏模块接口。

当前覆盖能力：

- 健康检查
- 访问凭证
- WeGame 凭证登录、导入、查询、刷新、删除
- 账号管理
- 开发者 API Key

游戏模块文档：

- [Rocom-API.md](./modules/rocom/Rocom-API.md)

## 核心原则

- WeGame 最小凭证只需要 `tgp_id` 和 `tgp_ticket`
- 所有游戏请求统一通过我方 `frameworkToken` 访问
- 共享登录层与平台能力统一维护在本文件
- 各游戏接口按游戏拆分为独立文档维护
- 核心链路以 PostgreSQL 为主存储，Redis 提供缓存与令牌辅助能力

### 响应格式

除少数特殊场景外，当前接口统一返回：

```json
{
  "code": 0,
  "message": "成功",
  "data": {}
}
```

字段说明：

- `code`: 业务码，`0` 表示成功
- `message`: 响应说明
- `data`: 业务数据

错误响应示例：

```json
{
  "code": 400,
  "message": "缺少 X-Framework-Token 请求头"
}
```

## 健康检查

- `GET /health`
- `GET /health/detailed`

## 已接入游戏列表

- `GET /api/v1/games`

说明：

- 返回当前服务已接入的游戏目录
- 每个游戏项会给出 `code`、`name`、正式接口前缀 `api_base_path`
- 各游戏接口统一走 `/api/v1/games/<game_code>/*`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "games": [
      {
        "code": "rocom",
        "name": "洛克王国世界",
        "api_base_path": "/api/v1/games/rocom",
        "scope": "game:rocom"
      }
    ],
    "total": 1
  }
}
```

## 访问凭证

基础认证至少支持以下一种：

- `Authorization: Bearer <web-jwt>`
- `X-API-Key: <api-key>`
- `X-Anonymous-Token: <anonymous-token>`

说明：

- 如果使用 `X-API-Key`，它必须与接口所属作用域匹配
- WeGame 登录与绑定相关接口使用 `scope=wegame`
- 游戏接口使用各自的 `scope=game:<game_code>`，具体看对应游戏文档

匿名访问令牌可通过以下接口获取：

- `POST /api/v1/auth/anonymous-token`

说明：

- `/api/v1/login/wegame/*` 这组接口不强制要求 `API Key`
- 如果带 `X-API-Key` 调用这组接口，必须使用 `scope=wegame`
- 机器人 / 插件场景推荐先申请匿名令牌，再带 `X-Anonymous-Token` 调用 WeGame 登录接口
- `POST /api/v1/auth/anonymous-token` 支持传 `fingerprint`
- 如果没有传 `fingerprint`，服务端会根据请求信息自动生成一个匿名指纹

请求示例：

```json
{
  "fingerprint": "yunzai_wegame_2621529331_3663352463_abcdef1234567890"
}
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "token": "anon_xxxxxxxxxxxxxxxxxxxx",
    "expires_at": "2026-04-06T21:00:00+08:00",
    "token_type": "Anonymous"
  }
}
```

## WeGame 凭证

当前支持两种进入方式：

- WeGame QQ / 微信扫码登录
- 直接导入 `tgp_id + tgp_ticket`

扫码登录与手动导入最终都会落成同一种凭证记录，后续统一通过 `frameworkToken` 调用具体游戏模块接口。

这组登录接口支持以下任一认证方式：

- `X-Anonymous-Token`
- `X-API-Key`，但必须使用 `scope=wegame`
- `Authorization: Bearer <web-jwt>`

推荐接入流程：

1. `POST /api/v1/auth/anonymous-token`
2. 带 `X-Anonymous-Token` 调用 `/api/v1/login/wegame/wechat/qr` 或 `/api/v1/login/wegame/qr`
3. 轮询状态接口
4. 登录完成后使用返回的 `frameworkToken`
5. 再去调用对应游戏文档里的游戏接口

### QQ 扫码登录

`GET /api/v1/login/wegame/qr`

第三方客户端可选参数：

- `user_identifier=<你的用户标识>`
- `client_type=bot|app|web`
- `client_id=<客户端标识>`

说明：

- 第三方客户端在带 `scope=wegame` 的 `X-API-Key` 情况下，如果这里同时传了 `user_identifier`
- 登录成功后后端会自动创建或更新账号绑定
- 这样后续可以直接查询 `/api/v1/user/bindings`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "a6f8c28d-92b2-4ddd-a115-d9271e224c9a",
    "qr_image": "data:image/png;base64,...",
    "expire": 1775397796817,
    "auto_bind": false
  }
}
```

### QQ 扫码状态

`GET /api/v1/login/wegame/status`

请求头：

- `X-Framework-Token: <frameworkToken>`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "code": 1,
    "status": "pending",
    "msg": "等待扫码"
  }
}
```

状态说明：

- `pending`: 等待扫码
- `scanned`: 已扫码，待手机确认
- `processing`: 已确认，正在换取 WeGame 凭证
- `done`: 登录成功
- `expired`: 二维码过期

### 微信扫码登录

`GET /api/v1/login/wegame/wechat/qr`

第三方客户端可选参数：

- `user_identifier=<你的用户标识>`
- `client_type=bot|app|web`
- `client_id=<客户端标识>`

说明：

- 第三方客户端在带 `scope=wegame` 的 `X-API-Key` 情况下，如果这里同时传了 `user_identifier`
- 登录成功后后端会自动创建或更新账号绑定
- 这样后续可以直接查询 `/api/v1/user/bindings`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "9750e586-63ca-44bc-a2a8-2ebe28a3c9de",
    "qr_image": "https://open.weixin.qq.com/connect/qrcode/061O0MK84NZHFa1b",
    "expire": 1775397815642,
    "auto_bind": false
  }
}
```

### 微信扫码状态

`GET /api/v1/login/wegame/wechat/status`

请求头：

- `X-Framework-Token: <frameworkToken>`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "code": 1,
    "status": "pending",
    "msg": "等待扫码"
  }
}
```

扫码状态进入 `done` 后，可直接继续使用：

- `GET /api/v1/login/wegame/token`
- `GET /api/v1/login/wegame/wechat/token`

这两个接口都会返回当前 `frameworkToken` 对应的已保存 WeGame 凭证信息。

### 导入凭证

`POST /api/v1/login/wegame/token`

请求体：

```json
{
  "tgp_id": "295231685",
  "tgp_ticket": "your_ticket_here",
  "user_identifier": "2621529331",
  "client_type": "bot",
  "client_id": "yunzai"
}
```

说明：

- `user_identifier / client_type / client_id` 仅第三方客户端自动绑定时需要
- 如果第三方导入凭证时传了 `user_identifier`，后端会自动创建或更新账号绑定
- 如果登录时没传 `user_identifier`，后续仍可单独调用 `POST /api/v1/user/bindings` 绑定

返回核心字段：

- `frameworkToken`
- `tgpId`
- `isValid`
- `role`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
    "tgpId": "295231685",
    "isValid": true,
    "loginType": "manual",
    "auto_bind": true,
    "binding": {
      "id": "67f12d2f4436d8d0d82f8b61",
      "framework_token": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
      "token_type": "wegame",
      "login_type": "manual",
      "client_type": "bot",
      "tgp_id": "295231685",
      "is_primary": true,
      "is_valid": true,
      "created_at": "2026-04-06T16:30:00+08:00",
      "updated_at": "2026-04-06T16:30:00+08:00"
    },
    "role": {
      "openid": "xxxxxxxx",
      "id": "xxxxxxxx",
      "name": "你的角色名",
      "avatar": "https://...",
      "create_time": "2025-01-01 12:00:00",
      "is_online": 0,
      "level": 100,
      "star": 5
    }
  }
}
```

### 查询凭证

`GET /api/v1/login/wegame/token`

请求头：

- `X-Framework-Token: <frameworkToken>`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
    "tgpId": "295231685",
    "isValid": true,
    "isBind": false,
    "expireAt": 1775415600000,
    "loginType": "qq",
    "updatedAt": "2026-04-05T21:40:00+08:00"
  }
}
```

### 微信扫码凭证查询

`GET /api/v1/login/wegame/wechat/token`

请求头：

- `X-Framework-Token: <frameworkToken>`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "9750e586-63ca-44bc-a2a8-2ebe28a3c9de",
    "tgpId": "295231685",
    "isValid": true,
    "isBind": false,
    "expireAt": 1775417100000,
    "loginType": "wechat",
    "updatedAt": "2026-04-05T22:05:00+08:00"
  }
}
```

### 刷新凭证

`GET /api/v1/login/wegame/refresh`

请求头：

- `X-Framework-Token: <frameworkToken>`

说明：

- 当前仅 `QQ` 扫码登录得到的 WeGame 凭证支持刷新
- 刷新依赖服务端保存的 `qqNumber + cookieData`
- 手动导入的 `tgp_id + tgp_ticket` 凭证不支持刷新
- `WeGame 微信扫码` 当前也不支持同类刷新
- 原因是现有微信链路只拿到一次性的 `wxCode -> tgp_ticket` 结果，没有可持续复用的 refresh 凭据

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "success": true,
    "message": "刷新成功",
    "frameworkToken": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
    "tgpId": "295231685",
    "loginType": "qq",
    "expireAt": 1775419200000
  }
}
```

### 删除凭证

`DELETE /api/v1/login/wegame/token`

请求头：

- `X-Framework-Token: <frameworkToken>`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "success": true,
    "message": "已删除"
  }
}
```

## 账号管理

以下接口已经实现，可直接用于多账号场景：

- 手动绑定：`POST /api/v1/user/bindings`
- 账号列表：`GET /api/v1/user/bindings`
- 切换账号：`POST /api/v1/user/bindings/:id/primary`
- 刷新绑定凭证：`POST /api/v1/user/bindings/:id/refresh`
- 删除账号：`DELETE /api/v1/user/bindings/:id`

认证方式：

- Web 用户：`Authorization: Bearer <web-jwt>`
- 第三方客户端：`X-API-Key: <wegame-api-key>`，并额外提供 `user_identifier`

第三方客户端说明：

- `user_identifier` 可放在 query 参数或 `X-User-Identifier` 请求头
- 第三方客户端这里必须使用 `scope=wegame` 的 API Key
- 这三类接口都会按当前用户作用域操作，不会串账号

### 账号列表

`GET /api/v1/user/bindings`

第三方客户端额外参数：

- `user_identifier=<你的用户标识>`

说明：

- 返回当前用户已绑定的全部 WeGame 账号
- `is_primary=true` 表示当前默认账号
- `is_valid=false` 表示当前绑定凭证已失效
- 第三方如果登录时没传 `user_identifier`，这里不会自动出现账号，需要后续手动调一次 `POST /api/v1/user/bindings`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "bindings": [
      {
        "id": "67f12d2f4436d8d0d82f8b61",
        "framework_token": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
        "token_type": "wegame",
        "login_type": "qq",
        "client_type": "web",
        "tgp_id": "295231685",
        "role_id": "10000001",
        "role_openid": "oA1234567890",
        "nickname": "洛克训练师",
        "avatar": "https://game.gtimg.cn/avatar.png",
        "is_primary": true,
        "is_valid": true,
        "created_at": "2026-04-05T22:10:00+08:00",
        "updated_at": "2026-04-05T22:12:00+08:00"
      },
      {
        "id": "67f12d684436d8d0d82f8b62",
        "framework_token": "9750e586-63ca-44bc-a2a8-2ebe28a3c9de",
        "token_type": "wegame",
        "login_type": "wechat",
        "client_type": "web",
        "tgp_id": "295231999",
        "role_id": "10000002",
        "role_openid": "oA1234567899",
        "nickname": "世界冒险家",
        "avatar": "https://game.gtimg.cn/avatar2.png",
        "is_primary": false,
        "is_valid": true,
        "created_at": "2026-04-05T22:15:00+08:00",
        "updated_at": "2026-04-05T22:15:30+08:00"
      }
    ]
  }
}
```

### 手动创建绑定

`POST /api/v1/user/bindings`

请求体：

```json
{
  "framework_token": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
  "user_identifier": "2621529331",
  "client_type": "bot",
  "client_id": "yunzai"
}
```

说明：

- 用于把一份已保存的 `frameworkToken` 手动绑定到当前用户
- Web 用户可直接带 `Authorization: Bearer <web-jwt>` 调用
- 第三方客户端需要带 `X-API-Key: <wegame-api-key>`，并提供 `user_identifier`
- `client_type` 仅允许 `web`、`bot`、`app`
- 如果该 `frameworkToken` 已存在绑定，则会更新原绑定并返回 `200`
- 如果是新绑定，则返回 `201`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "binding": {
      "id": "67f12d2f4436d8d0d82f8b61",
      "framework_token": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
      "token_type": "wegame",
      "login_type": "manual",
      "client_type": "bot",
      "tgp_id": "295231685",
      "is_primary": true,
      "is_valid": true,
      "created_at": "2026-04-05T22:10:00+08:00",
      "updated_at": "2026-04-05T22:10:00+08:00"
    },
    "message": "绑定成功"
  }
}
```

### 切换账号

`POST /api/v1/user/bindings/:id/primary`

第三方客户端额外参数：

- `user_identifier=<你的用户标识>`

说明：

- 用于把指定绑定切换为默认账号
- 切换成功后，该账号会变成 `is_primary=true`
- 同一时刻只有一个主账号

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "主绑定已更新"
  }
}
```

### 刷新绑定凭证

`POST /api/v1/user/bindings/:id/refresh`

第三方客户端额外参数：

- `user_identifier=<你的用户标识>`

说明：

- 用于刷新指定绑定对应的 `framework_token`
- 刷新成功后会返回新的 `framework_token`
- 该接口适用于“绑定层 token 刷新”，不是 WeGame QQ 凭证的底层刷新接口
- 如果底层 WeGame 凭证本身不可刷新，这里也会失败

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "framework_token": "b44d4e29-6b48-4a8d-a8be-3f73f3d862d6",
    "message": "凭证已刷新"
  }
}
```

### 删除账号

`DELETE /api/v1/user/bindings/:id`

第三方客户端额外参数：

- `user_identifier=<你的用户标识>`

说明：

- 删除后，该绑定对应账号会从当前用户账号列表移除
- 如果删除的是当前主账号，后端会自动提升下一条绑定为主账号

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "解绑成功"
  }
}
```

## 开发者 API Key

开发者 API Key 现在已经改成按作用域分层：

- `wegame`
- `game:<game_code>`

当前已注册游戏里，会自动出现对应 scope。比如洛克王国世界就是：

- `game:rocom`

同一用户同一 scope 只允许存在 1 个有效 API Key，所以现在是 `1 + n` 的结构：

- 1 个 `wegame` key
- n 个各游戏自己的 key

当前开发者能力使用 PostgreSQL，并且按 schema 隔离：

- `wegame.api_keys`
- `wegame.api_usage_stats`
- `game_<game_code>.api_keys`
- `game_<game_code>.api_usage_stats`

旧的权限申请与动态权限守卫已经移除，不再使用 `api_permissions` / `api_permission_requests`。

以下接口都要求 `Authorization: Bearer <web-jwt>`：

- `GET /api/v1/developer/api-key-scopes`
- `GET /api/v1/developer/api-keys`
- `POST /api/v1/developer/api-keys`
- `DELETE /api/v1/developer/api-keys/:id`
- `GET /api/v1/developer/api-keys/:id/reveal`
- `POST /api/v1/developer/api-keys/:id/regenerate`
- `PUT /api/v1/developer/api-keys/:id/settings`

如果暂时没有 Web 用户，也可以直接在服务根目录执行：

```bash
go run ./cmd/api-keygen --scope wegame
go run ./cmd/api-keygen --scope game:rocom
```

常用参数：

- `--user-id <24位ObjectID>`: 指定归属用户
- `--scope <scope>`: 例如 `wegame` 或 `game:rocom`
- `--name <名称>`: 可选，不传则按 scope 自动生成

如果不传 `--user-id`，命令会自动生成一个新的用户 ID，并一起打印出来。
如果你要生成同一套 `1 + n` 的 key，请复用同一个 `--user-id`。

输出示例：

```text
database=wegame_api
generated_user_id=true
user_id=69d27d62b4a01afd687c1814
api_key_id=69d27d62b4a01afd687c1815
scope=game:rocom
api_key=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
name=洛克王国世界 API Key
rate_limit=60
```

### 获取可用 Scope

`GET /api/v1/developer/api-key-scopes`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "scopes": [
      {
        "scope": "wegame",
        "kind": "platform",
        "name": "WeGame 登录层"
      },
      {
        "scope": "game:rocom",
        "kind": "game",
        "name": "洛克王国世界",
        "game_code": "rocom"
      }
    ]
  }
}
```

### 获取 API Key 列表

`GET /api/v1/developer/api-keys`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "keys": [
      {
        "id": "67f138724436d8d0d82f8e31",
        "scope": "wegame",
        "name": "WeGame 登录层 API Key",
        "key_prefix": "sk-3f8a...",
        "rate_limit": 60,
        "origin_whitelist": ["https://bot.example.com"],
        "ip_whitelist": ["127.0.0.1"],
        "total_calls": 128,
        "last_used_at": "2026-04-05T23:10:00+08:00",
        "created_at": "2026-04-05T22:50:00+08:00"
      }
    ],
    "scopes": [
      {
        "scope": "wegame",
        "kind": "platform",
        "name": "WeGame 登录层"
      },
      {
        "scope": "game:rocom",
        "kind": "game",
        "name": "洛克王国世界",
        "game_code": "rocom"
      }
    ]
  }
}
```

### 创建 API Key

`POST /api/v1/developer/api-keys`

请求体：

```json
{
  "scope": "game:rocom",
  "name": "AstrBot Rocom"
}
```

响应示例：

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "details": {
      "id": "67f138724436d8d0d82f8e31",
      "scope": "game:rocom",
      "name": "AstrBot Rocom",
      "key_prefix": "sk-3f8a...",
      "rate_limit": 60,
      "total_calls": 0,
      "created_at": "2026-04-05T22:50:00+08:00"
    },
    "message": "API Key 创建成功，请妥善保管，此密钥仅显示一次"
  }
}
```

如果同一用户已经创建过该 scope 的 key，再次创建会直接报错。

### 查看、删除、重置 API Key

- `GET /api/v1/developer/api-keys/:id/reveal`
- `DELETE /api/v1/developer/api-keys/:id`
- `POST /api/v1/developer/api-keys/:id/regenerate`

### 更新 API Key 设置

`PUT /api/v1/developer/api-keys/:id/settings`

请求体示例：

```json
{
  "name": "AstrBot Rocom Production",
  "rate_limit": 120,
  "origin_whitelist": ["https://bot.example.com"],
  "ip_whitelist": ["127.0.0.1", "192.168.10.21"]
}
```

说明：

- `origin_whitelist` 支持域名、完整 URL、或 `*.example.com` 这种后缀匹配
- `ip_whitelist` 当前只支持精确 IP 匹配，不支持 CIDR 网段
- `rate_limit` 为单 key 的每分钟请求上限

响应示例：

```json
{
  "code": 0,
  "message": "设置已更新"
}
```
