const REDIS_KEY = (userId) => `WEGAME:USER:${userId}`
const LEGACY_REDIS_KEY = (userId) => `ROCOKDOM:USER:${userId}`

function normalizeRole (role = {}) {
  if (!role || typeof role !== 'object') return null

  return {
    openid: role.openid ? String(role.openid) : '',
    id: role.id ? String(role.id) : '',
    name: role.name ? String(role.name) : '',
    avatar: role.avatar ? String(role.avatar) : '',
    create_time: role.create_time ? String(role.create_time) : '',
    is_online: role.is_online ?? null,
    level: role.level ?? null,
    star: role.star ?? null
  }
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

  return {
    frameworkToken,
    tgpId: payload.tgpId ? String(payload.tgpId) : payload.tgp_id ? String(payload.tgp_id) : '',
    isValid: payload.isValid !== false && payload.is_valid !== false,
    isBind: payload.isBind !== undefined ? Boolean(payload.isBind) : payload.is_bind !== undefined ? Boolean(payload.is_bind) : true,
    loginType: payload.loginType ? String(payload.loginType) : payload.login_type ? String(payload.login_type) : '',
    updatedAt: payload.updatedAt ? String(payload.updatedAt) : payload.updated_at ? String(payload.updated_at) : new Date().toISOString(),
    role: normalizeRole(payload.role)
  }
}

function migrateLegacyState (data = {}) {
  if (!data || typeof data !== 'object') return {}
  if (data.lastCredential) {
    return {
      lastCredential: data.lastCredential,
      updatedAt: data.updatedAt ? String(data.updatedAt) : new Date().toISOString()
    }
  }

  const legacyCredential = data?.[data.currentPlatform] || data?.qq || data?.wechat
  const normalized = normalizeCredential(legacyCredential)

  return normalized
    ? {
        lastCredential: normalized,
        updatedAt: data.updatedAt ? String(data.updatedAt) : new Date().toISOString()
      }
    : {
        lastCredential: null,
        updatedAt: data.updatedAt ? String(data.updatedAt) : new Date().toISOString()
      }
}

async function getUserState (userId) {
  let text = await redis.get(REDIS_KEY(userId))
  if (!text) {
    text = await redis.get(LEGACY_REDIS_KEY(userId))
  }
  if (!text) {
    return {
      lastCredential: null,
      updatedAt: ''
    }
  }

  try {
    const data = migrateLegacyState(JSON.parse(text))
    return {
      lastCredential: normalizeCredential(data.lastCredential),
      updatedAt: data.updatedAt ? String(data.updatedAt) : ''
    }
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

  await redis.set(REDIS_KEY(userId), JSON.stringify(next))
  await redis.set(LEGACY_REDIS_KEY(userId), JSON.stringify(next))
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
  LEGACY_REDIS_KEY,
  REDIS_KEY,
  getLastCredential,
  getUserState,
  normalizeCredential,
  normalizeRole,
  saveLastCredential,
  setUserState
}
