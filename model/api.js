import crypto from 'node:crypto'
import os from 'node:os'
import axios from 'axios'
import Config from '../utils/config.js'

const ANON_REFRESH_BUFFER_MS = 30 * 1000

let anonymousTokenCache = {
  token: '',
  expiresAt: 0
}

function trimSlash (value) {
  return String(value || '').replace(/\/+$/, '')
}

function createRequestError (message, extra = {}) {
  const error = new Error(message)
  Object.assign(error, extra)
  return error
}

function getErrorMessage (error) {
  if (error?.response?.data?.message) return String(error.response.data.message)
  if (error?.response?.statusText) return String(error.response.statusText)
  if (error?.message) return String(error.message)
  return '未知错误'
}

function parseExpireAt (value) {
  const time = Date.parse(String(value || ''))
  if (!Number.isNaN(time)) return time
  return Date.now() + 55 * 60 * 1000
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeClientType (value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return ''
  if (['bot', 'app', 'web'].includes(text)) return text
  if (['yunzai', 'qqbot', 'onebot', 'oicq'].includes(text)) return 'bot'
  return text
}

export { createRequestError }

export default class WeGameApi {
  constructor () {
    this.client = axios.create({
      timeout: Number(Config.get('wegame', 'request_timeout_ms')) || 15000,
      validateStatus: () => true
    })
  }

  getBaseUrl () {
    const baseUrl = trimSlash(Config.get('wegame', 'base_url'))
    if (!baseUrl) {
      throw createRequestError('请先在 WeGame 插件配置中填写后端 base_url')
    }
    return baseUrl
  }

  getDeviceFingerprint () {
    const configured = String(Config.get('wegame', 'device_fingerprint') || '').trim()
    if (configured) return configured

    return crypto
      .createHash('sha256')
      .update(`${os.hostname()}:${process.cwd()}:wegame-plugin`)
      .digest('hex')
      .slice(0, 32)
  }

  getDeviceHeaders () {
    const fingerprint = this.getDeviceFingerprint()
    return {
      'X-Device-Fingerprint': fingerprint,
      'X-Device-Id': fingerprint
    }
  }

  async createAnonymousToken () {
    const data = await this.request('/api/v1/auth/anonymous-token', {
      method: 'post',
      needBaseAuth: false
    })

    if (!data?.token) {
      throw createRequestError('匿名访问令牌获取失败')
    }

    anonymousTokenCache = {
      token: String(data.token),
      expiresAt: parseExpireAt(data.expires_at)
    }

    return anonymousTokenCache.token
  }

  async getBaseAuthHeaders () {
    const apiKey = String(Config.get('wegame', 'api_key') || '').trim()
    if (apiKey) {
      return { 'X-API-Key': apiKey }
    }

    const now = Date.now()
    if (
      anonymousTokenCache.token &&
      anonymousTokenCache.expiresAt > now + ANON_REFRESH_BUFFER_MS
    ) {
      return { 'X-Anonymous-Token': anonymousTokenCache.token }
    }

    const anonymousToken = await this.createAnonymousToken()
    return { 'X-Anonymous-Token': anonymousToken }
  }

  getApiKey () {
    const apiKey = String(Config.get('wegame', 'api_key') || '').trim()
    if (!apiKey) {
      throw createRequestError('账号管理接口需要先在 wgconfig.yaml 中填写 wegame.api_key')
    }
    return apiKey
  }

  getClientScopeParams () {
    const clientType = normalizeClientType(Config.get('wegame', 'client_type'))
    const clientId = String(Config.get('wegame', 'client_id') || '').trim()
    const params = {}

    if (clientType) {
      params.client_type = clientType
    }

    if (clientId) {
      params.client_id = clientId
    }

    return params
  }

  buildOptionalUserScopeOptions (userIdentifier) {
    const normalized = String(userIdentifier || '').trim()
    const apiKey = String(Config.get('wegame', 'api_key') || '').trim()

    if (!apiKey || !normalized) {
      return {}
    }

    return {
      headers: {
        'X-User-Identifier': normalized
      },
      params: {
        user_identifier: normalized,
        ...this.getClientScopeParams()
      }
    }
  }

  buildUserScopeOptions (userIdentifier) {
    const normalized = String(userIdentifier || '').trim()
    if (!normalized) {
      throw createRequestError('缺少 user_identifier')
    }

    return {
      headers: {
        'X-API-Key': this.getApiKey(),
        'X-User-Identifier': normalized
      },
      params: {
        user_identifier: normalized,
        ...this.getClientScopeParams()
      }
    }
  }

  async request (urlPath, options = {}) {
    const {
      method = 'get',
      params,
      data,
      headers = {},
      needBaseAuth = false
    } = options

    const fingerprint = this.getDeviceFingerprint()
    const finalHeaders = {
      ...this.getDeviceHeaders(),
      ...headers
    }
    const finalParams = isPlainObject(params)
      ? { device_fingerprint: fingerprint, ...params }
      : { device_fingerprint: fingerprint }

    let finalData = data
    if (isPlainObject(data)) {
      finalData = {
        device_fingerprint: fingerprint,
        ...data
      }
    }

    if (needBaseAuth) {
      Object.assign(finalHeaders, await this.getBaseAuthHeaders())
    }

    let response
    try {
      response = await this.client.request({
        url: `${this.getBaseUrl()}${urlPath}`,
        method,
        params: finalParams,
        data: finalData,
        headers: finalHeaders
      })
    } catch (error) {
      throw createRequestError(getErrorMessage(error), {
        originalError: error
      })
    }

    const body = response.data
    if (!body || typeof body !== 'object') {
      if (response.status >= 400) {
        throw createRequestError(`请求失败：HTTP ${response.status}`)
      }
      return body
    }

    if (Number(body.code) !== 0) {
      throw createRequestError(body.message || `请求失败：业务码 ${body.code}`, {
        responseBody: body,
        responseStatus: response.status
      })
    }

    return body.data ?? {}
  }

  buildFrameworkHeaders (frameworkToken) {
    const token = String(frameworkToken || '').trim()
    if (!token) {
      throw createRequestError('缺少 frameworkToken')
    }
    return {
      'X-Framework-Token': token
    }
  }

  requestFrameworkGet (urlPath, frameworkToken, params = undefined) {
    return this.request(urlPath, {
      method: 'get',
      params,
      headers: this.buildFrameworkHeaders(frameworkToken),
      needBaseAuth: true
    })
  }

  requestGameFrameworkGet (urlPath, frameworkToken, _gameCode, params = undefined) {
    return this.request(urlPath, {
      method: 'get',
      params,
      headers: this.buildFrameworkHeaders(frameworkToken),
      needBaseAuth: true
    })
  }

  requestUserScopedGet (urlPath, userIdentifier, params = {}) {
    const scoped = this.buildUserScopeOptions(userIdentifier)
    const scopedParams = isPlainObject(scoped.params) ? scoped.params : {}
    const extraParams = isPlainObject(params) ? params : {}

    return this.request(urlPath, {
      method: 'get',
      headers: scoped.headers,
      params: {
        ...scopedParams,
        ...extraParams
      }
    })
  }

  getHealth () {
    return this.request('/health')
  }

  getDetailedHealth () {
    return this.request('/health/detailed')
  }

  getGames () {
    return this.request('/api/v1/games', {
      method: 'get',
      needBaseAuth: true
    })
  }

  getLoginQr (platform = 'qq', userIdentifier = '') {
    const path = platform === 'wechat'
      ? '/api/v1/login/wegame/wechat/qr'
      : '/api/v1/login/wegame/qr'

    return this.request(path, {
      method: 'get',
      ...this.buildOptionalUserScopeOptions(userIdentifier),
      needBaseAuth: true
    })
  }

  getLoginStatus (platform = 'qq', frameworkToken, userIdentifier = '') {
    const path = platform === 'wechat'
      ? '/api/v1/login/wegame/wechat/status'
      : '/api/v1/login/wegame/status'

    const scoped = this.buildOptionalUserScopeOptions(userIdentifier)

    return this.request(path, {
      method: 'get',
      headers: {
        ...this.buildFrameworkHeaders(frameworkToken),
        ...(scoped.headers || {})
      },
      params: scoped.params,
      needBaseAuth: true
    })
  }

  getLoginToken (platform = 'qq', frameworkToken, userIdentifier = '') {
    const path = platform === 'wechat'
      ? '/api/v1/login/wegame/wechat/token'
      : '/api/v1/login/wegame/token'

    const scoped = this.buildOptionalUserScopeOptions(userIdentifier)

    return this.request(path, {
      method: 'get',
      headers: {
        ...this.buildFrameworkHeaders(frameworkToken),
        ...(scoped.headers || {})
      },
      params: scoped.params,
      needBaseAuth: true
    })
  }

  importLoginToken (payload = {}, userIdentifier = '') {
    return this.request('/api/v1/login/wegame/token', {
      method: 'post',
      ...this.buildOptionalUserScopeOptions(userIdentifier),
      data: payload,
      needBaseAuth: true
    })
  }

  deleteLoginToken (frameworkToken, userIdentifier = '') {
    const scoped = this.buildOptionalUserScopeOptions(userIdentifier)

    return this.request('/api/v1/login/wegame/token', {
      method: 'delete',
      headers: {
        ...this.buildFrameworkHeaders(frameworkToken),
        ...(scoped.headers || {})
      },
      params: scoped.params,
      needBaseAuth: true
    })
  }

  getUserBindings (userIdentifier) {
    return this.request('/api/v1/user/bindings', {
      method: 'get',
      ...this.buildUserScopeOptions(userIdentifier)
    })
  }

  setPrimaryBinding (bindingId, userIdentifier) {
    const normalized = String(bindingId || '').trim()
    if (!normalized) {
      throw createRequestError('缺少绑定 ID')
    }

    return this.request(`/api/v1/user/bindings/${encodeURIComponent(normalized)}/primary`, {
      method: 'post',
      ...this.buildUserScopeOptions(userIdentifier)
    })
  }

  deleteUserBinding (bindingId, userIdentifier) {
    const normalized = String(bindingId || '').trim()
    if (!normalized) {
      throw createRequestError('缺少绑定 ID')
    }

    return this.request(`/api/v1/user/bindings/${encodeURIComponent(normalized)}`, {
      method: 'delete',
      ...this.buildUserScopeOptions(userIdentifier)
    })
  }
}
