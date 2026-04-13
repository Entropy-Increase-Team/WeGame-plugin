# WeGame API

本文档描述共享 WeGame 登录层与平台侧接口，不包含具体游戏模块接口。

如果你要查看前端页面、用户中心和开发者控制台直接使用的 Web 接口，请看：

- [WeGame-Web-API.md](./WeGame-Web-API.md)

当前覆盖能力：

- 健康检查
- 访问凭证
- WeGame 凭证登录、导入、查询、刷新、删除
- 账号管理
- 开发者 API Key

游戏模块文档：

- [Rocom-API.md](./Rocom-API.md)
- [DF-API.md](./DF-API.md)

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

说明：

- `GET /health` 仅返回进程基础状态
- `GET /health/detailed` 会检查 PostgreSQL 和 Redis
- PostgreSQL 不可用时返回 `503`
- Redis 不可用但 PostgreSQL 正常时返回 `200`，`data.status` 为 `degraded`

## 已接入游戏列表

- `GET /api/v1/games`

说明：

- 返回当前服务已接入的游戏目录
- 每个游戏项会给出 `code`、`name`、正式接口前缀 `api_base_path`
- `api_key_scope` 固定为开发者统一使用的 `wegame`
- `permission_scope` 表示申请对应游戏权限时使用的 scope
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
        "api_key_scope": "wegame",
        "permission_scope": "game:rocom"
      },
      {
        "code": "df",
        "name": "三角洲行动",
        "api_base_path": "/api/v1/games/df",
        "api_key_scope": "wegame",
        "permission_scope": "game:df"
      }
    ],
    "total": 2
  }
}
```

## 访问凭证

基础认证至少支持以下一种：

- `Authorization: Bearer <web-jwt>`
- `X-API-Key: <api-key>`
- `X-Anonymous-Token: <anonymous-token>`

说明：

- 如果使用 `X-API-Key`，统一使用开发者 `WeGame API Key`
- WeGame 登录、绑定和平台侧接口直接使用这把 `wegame` Key 即可
- 游戏接口仍然使用同一把 `wegame` Key，但还需要提前获批对应游戏权限，具体看对应游戏文档

匿名访问令牌可通过以下接口获取：

- `POST /api/v1/auth/anonymous-token`

说明：

- `/api/v1/login/wegame/*` 这组接口不强制要求 `API Key`
- 如果带 `X-API-Key` 调用这组接口，使用开发者 `WeGame API Key` 即可
- 机器人 / 插件场景推荐先申请匿名令牌，再带 `X-Anonymous-Token` 调用 WeGame 登录接口
- `POST /api/v1/auth/anonymous-token` 支持传 `fingerprint`
- 如果没有传 `fingerprint`，服务端会根据请求信息自动生成一个匿名指纹
- 匿名令牌依赖 Redis；Redis 不可用时该接口会返回 `503`
- 匿名令牌固定 `24` 小时过期，累计最多校验 `1000` 次

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
- `X-API-Key`，使用开发者 `WeGame API Key`
- `Authorization: Bearer <web-jwt>`

另外需要注意：

- `frameworkToken` 的登录管理接口现在按“创建它的当前身份”做 owner 校验
- Web 用户创建 / 导入的凭证，后续只能由同一个 Web 用户继续轮询、查询、刷新、删除
- API Key 创建 / 导入的凭证，后续至少要用同一位开发者的 `WeGame API Key`；如果创建时带了 `user_identifier`，后续还必须带同一个 `user_identifier`
- 匿名身份创建的凭证，只能由同一匿名指纹继续轮询和管理
- 具体游戏数据接口仍然是“拿到 `frameworkToken` 就能访问对应游戏能力”；这里的 owner 约束只针对登录管理接口

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

- 第三方客户端在带开发者 `WeGame API Key` 的情况下，如果这里同时传了 `user_identifier`
- 登录成功后后端会自动创建或更新账号绑定
- 这样后续可以直接查询 `/api/v1/user/bindings`
- 这个二维码会绑定当前调用身份；后续轮询状态时要继续使用同一身份

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

说明：

- 轮询状态时会校验当前身份是否就是创建该二维码的身份

### 微信扫码登录

`GET /api/v1/login/wegame/wechat/qr`

第三方客户端可选参数：

- `user_identifier=<你的用户标识>`
- `client_type=bot|app|web`
- `client_id=<客户端标识>`

说明：

- 第三方客户端在带开发者 `WeGame API Key` 的情况下，如果这里同时传了 `user_identifier`
- 登录成功后后端会自动创建或更新账号绑定
- 这样后续可以直接查询 `/api/v1/user/bindings`
- 这个二维码会绑定当前调用身份；后续轮询状态时要继续使用同一身份

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

说明：

- 调用这两个查询接口时，也会校验当前身份是否就是创建该 `frameworkToken` 的身份

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
- 导入得到的这份 `frameworkToken` 同样会绑定当前调用身份，后续查询 / 刷新 / 删除都要用同一身份

返回核心字段：

- `frameworkToken`
- `tgpId`
- `isValid`
- `loginType`

说明：

- 共享 WeGame 层默认只返回 WeGame 凭证信息
- 如果需要 `rocom`、`df` 等具体游戏的角色资料，请改调各游戏模块接口
- 例如 RoCom 角色资料看 [Rocom-API.md](./Rocom-API.md) 的 `GET /api/v1/games/rocom/profile/role`
- DF 角色资料看 [DF-API.md](./DF-API.md) 的 `GET /api/v1/games/df/profile/role`

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
- 刷新前会先校验当前身份是否有权管理这份 `frameworkToken`

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

说明：

- 删除前会先校验当前身份是否有权管理这份 `frameworkToken`

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
- 第三方客户端这里统一使用开发者 `WeGame API Key`
- 这三类接口都会按当前用户作用域操作，不会串账号

### 账号列表

`GET /api/v1/user/bindings`

第三方客户端额外参数：

- `user_identifier=<你的用户标识>`

说明：

- 返回当前用户已绑定的全部 WeGame 账号
- `is_primary=true` 表示当前默认账号
- `is_valid=false` 表示当前绑定凭证已失效
- 如果需要当前用户在某个游戏下的账号列表，请使用对应游戏组件的 `accounts` 接口
- 共享绑定接口默认只返回 WeGame 层信息，不区分具体游戏角色资料
- 例如 RoCom 账号列表用 `GET /api/v1/games/rocom/accounts`
- DF 账号列表用 `GET /api/v1/games/df/accounts`
- 如果需要具体游戏角色资料，请使用对应游戏组件接口查询
- 例如 RoCom 用 `GET /api/v1/games/rocom/profile/role`
- DF 用 `GET /api/v1/games/df/profile/role`
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
- 该接口适用于“绑定层 token 轮换”，不是 WeGame QQ 凭证的底层刷新接口
- 只要底层凭证记录仍然存在且当前有效，就可以轮换新的 `framework_token`
- 如果底层凭证记录已丢失或已经失效，这里会失败

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

开发者 API Key 已经调整为单一模型：

- 每个开发者仅维护 1 个 `WeGame API Key`
- 游戏能力不再额外创建 `game:*` API Key
- 后续访问具体游戏时，统一依据对应游戏权限决定是否放行

当前开发者能力使用 PostgreSQL：

- `wegame.api_keys`
- `wegame.api_permissions`
- `wegame.api_key_permissions`
- `wegame.api_permission_requests`
- `wegame.api_usage_stats`
- `game_<game_code>.api_usage_stats`

也就是说，API Key 只有一把；平台层请求统计和全部权限数据都在 `wegame` schema，各游戏接口统计按游戏落在各自 schema。

以下接口都要求 `Authorization: Bearer <web-jwt>`：

- `GET /api/v1/developer/api-key-scopes`
- `GET /api/v1/developer/api-keys`
- `POST /api/v1/developer/api-keys`
- `DELETE /api/v1/developer/api-keys/:id`
- `POST /api/v1/developer/api-keys/:id/regenerate`
- `PUT /api/v1/developer/api-keys/:id/settings`

如果暂时没有 Web 用户，也可以直接在服务根目录执行：

```bash
go run ./cmd/api-keygen
```

常用参数：

- `--user-id <24位ObjectID>`: 指定归属用户
- `--scope <scope>`: 当前仅支持 `wegame`
- `--name <名称>`: 可选，不传则自动生成开发者 WeGame API Key

如果不传 `--user-id`，命令会自动生成一个新的用户 ID，并一起打印出来。
生成完成后，后续游戏权限通过开发者控制台申请，例如 `scope=game:rocom` 下的 `rocom.access`。

输出示例：

```text
database=wegame_api
generated_user_id=true
user_id=69d27d62b4a01afd687c1814
api_key_id=69d27d62b4a01afd687c1815
scope=wegame
api_key=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
name=开发者 WeGame API Key
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
        "name": "开发者 WeGame API Key"
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
        "name": "开发者 WeGame API Key",
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
        "name": "开发者 WeGame API Key"
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
  "name": "AstrBot Production"
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
      "scope": "wegame",
      "name": "AstrBot Production",
      "key_prefix": "sk-3f8a...",
      "rate_limit": 60,
      "total_calls": 0,
      "created_at": "2026-04-05T22:50:00+08:00"
    },
    "message": "API Key 创建成功，请妥善保管，此密钥仅显示一次"
  }
}
```

如果同一用户已经创建过开发者 API Key，再次创建会直接报错。
明文 key 不支持后续回显；如果遗失，请直接重新生成。

### 删除、重置 API Key

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
- `ip_whitelist` 当前只支持精确 IP 匹配，不支持 CIDR 网段；无效 IP 会直接报错
- `rate_limit` 为单 key 的每分钟请求上限，必须大于 `0`
- 如果传入 `name`，不能为空白字符串
- 服务端会自动裁剪空白并规范化 `origin_whitelist` / `ip_whitelist` 中的有效条目

### 游戏权限申请

单一开发者 API Key 创建完成后，访问游戏接口需要再申请对应游戏权限。

示例：

- `GET /api/v1/developer/permissions?scope=game:rocom`
- `POST /api/v1/developer/api-keys/:id/permissions`

提交权限申请时，请求体需要显式带上 `scope`，例如：

```json
{
  "scope": "game:rocom",
  "permission_code": "rocom.access",
  "reason": "需要接入洛克王国世界开放接口"
}
```

如果要撤销已授予权限，也需要显式带 `scope`，例如：

- `DELETE /api/v1/developer/api-keys/:id/permissions/rocom.access?scope=game:rocom`

当前洛克王国世界默认提供 `rocom.access` 权限，获批后即可使用 `/api/v1/games/rocom/*` 下的开放接口。

响应示例：

```json
{
  "code": 0,
  "message": "设置已更新"
}
```
