const USER_REDIS_KEY = (userId) => `WEGAME:USER:${userId}`

function normalizeRedisToken (value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function getGameRedisPrefix (gameCode = '') {
  const normalized = normalizeRedisToken(gameCode)
  if (!normalized) {
    throw new Error('缺少游戏模块标识')
  }

  return `WEGAME:GAMES:${normalized}`
}

function buildGameRedisKey (gameCode = '', ...parts) {
  const prefix = getGameRedisPrefix(gameCode)
  const suffix = parts
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  return suffix.length > 0 ? `${prefix}:${suffix.join(':')}` : prefix
}

async function getRedisJson (key, fallback = null) {
  const text = await redis.get(String(key || '').trim())
  if (!text) return fallback

  try {
    return JSON.parse(text)
  } catch (error) {
    logger.error(`[WeGame-plugin] 解析 Redis JSON 失败: ${key}`, error)
    return fallback
  }
}

async function setRedisJson (key, payload) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) {
    throw new Error('缺少 Redis 键名')
  }

  await redis.set(normalizedKey, JSON.stringify(payload))
  return payload
}

async function delRedisKey (key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return 0
  return redis.del(normalizedKey)
}

function normalizeRole (role = {}) {
  if (!role || typeof role !== 'object') return null

  const normalized = {}

  if (role.openid !== undefined && role.openid !== null && role.openid !== '') {
    normalized.openid = String(role.openid)
  }

  if (role.id !== undefined && role.id !== null && role.id !== '') {
    normalized.id = String(role.id)
  }

  if (role.name !== undefined && role.name !== null && role.name !== '') {
    normalized.name = String(role.name)
  }

  if (role.avatar !== undefined && role.avatar !== null && role.avatar !== '') {
    normalized.avatar = String(role.avatar)
  }

  if (role.create_time !== undefined && role.create_time !== null && role.create_time !== '') {
    normalized.create_time = String(role.create_time)
  }

  if (role.is_online !== undefined && role.is_online !== null) {
    normalized.is_online = role.is_online
  }

  if (role.level !== undefined && role.level !== null) {
    normalized.level = role.level
  }

  if (role.star !== undefined && role.star !== null) {
    normalized.star = role.star
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeCredential (platformOrPayload = {}, maybePayload) {
  const payload = maybePayload === undefined
    ? platformOrPayload
    : {
        ...maybePayload,
        loginType: maybePayload?.loginType || String(platformOrPayload || '')
      }

  if (!payload || typeof payload !== 'object') return null

  const frameworkToken = String(payload.frameworkToken || payload.framework_token || '').trim()
  if (!frameworkToken) return null

  const normalized = {
    frameworkToken,
    isValid: payload.isValid !== false && payload.is_valid !== false,
    isBind: payload.isBind !== undefined ? Boolean(payload.isBind) : payload.is_bind !== undefined ? Boolean(payload.is_bind) : true,
    updatedAt: payload.updatedAt ? String(payload.updatedAt) : payload.updated_at ? String(payload.updated_at) : new Date().toISOString()
  }

  const tgpId = payload.tgpId ? String(payload.tgpId) : payload.tgp_id ? String(payload.tgp_id) : ''
  if (tgpId) {
    normalized.tgpId = tgpId
  }

  const loginType = payload.loginType ? String(payload.loginType) : payload.login_type ? String(payload.login_type) : ''
  if (loginType) {
    normalized.loginType = loginType
  }

  const role = normalizeRole(payload.role)
  if (role) {
    normalized.role = role
  }

  return normalized
}

async function getUserState (userId) {
  const text = await redis.get(USER_REDIS_KEY(userId))
  if (!text) {
    return {
      lastCredential: null,
      updatedAt: ''
    }
  }

  try {
    const data = JSON.parse(text)
    const normalizedState = {
      lastCredential: normalizeCredential(data?.lastCredential),
      updatedAt: data?.updatedAt ? String(data.updatedAt) : ''
    }

    const currentState = {
      lastCredential: data?.lastCredential ?? null,
      updatedAt: data?.updatedAt ? String(data.updatedAt) : ''
    }

    if (JSON.stringify(normalizedState) !== JSON.stringify(currentState)) {
      await setRedisJson(USER_REDIS_KEY(userId), normalizedState)
    }

    return normalizedState
  } catch (error) {
    logger.error(`[WeGame-plugin] 解析用户状态失败: ${userId}`, error)
    return {
      lastCredential: null,
      updatedAt: ''
    }
  }
}

async function setUserState (userId, patch = {}) {
  const current = await getUserState(userId)
  const next = {
    ...current,
    ...patch,
    lastCredential: patch.lastCredential !== undefined ? normalizeCredential(patch.lastCredential) : current.lastCredential,
    updatedAt: new Date().toISOString()
  }

  await setRedisJson(USER_REDIS_KEY(userId), next)
  return next
}

async function saveLastCredential (userId, payload) {
  const lastCredential = normalizeCredential(payload)
  if (!lastCredential) throw new Error('凭证数据不完整，无法保存')
  return setUserState(userId, { lastCredential })
}

async function getLastCredential (userId) {
  const state = await getUserState(userId)
  return state.lastCredential || null
}

export {
  USER_REDIS_KEY,
  USER_REDIS_KEY as REDIS_KEY,
  buildGameRedisKey,
  delRedisKey,
  getLastCredential,
  getGameRedisPrefix,
  getRedisJson,
  getUserState,
  normalizeCredential,
  normalizeRole,
  saveLastCredential,
  setRedisJson,
  setUserState
}
