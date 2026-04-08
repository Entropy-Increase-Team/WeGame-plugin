import Config from '../utils/config.js'
import WeGameApi from './api.js'
import { formatCommand } from '../utils/command.js'
import {
  getLastCredential,
  normalizeCredential,
  saveLastCredential,
  setUserState
} from './store.js'

function sleep (ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeBinding (binding = {}) {
  if (!binding || typeof binding !== 'object') return null

  const id = String(binding.id || '').trim()
  const frameworkToken = String(binding.frameworkToken || binding.framework_token || '').trim()

  if (!id && !frameworkToken) return null

  return {
    id,
    frameworkToken,
    tokenType: String(binding.tokenType || binding.token_type || '').trim(),
    loginType: String(binding.loginType || binding.login_type || '').trim(),
    clientType: String(binding.clientType || binding.client_type || '').trim(),
    tgpId: String(binding.tgpId || binding.tgp_id || '').trim(),
    roleId: String(binding.roleId || binding.role_id || '').trim(),
    roleOpenid: String(binding.roleOpenid || binding.role_openid || '').trim(),
    nickname: String(binding.nickname || '').trim(),
    avatar: String(binding.avatar || '').trim(),
    isPrimary: binding.isPrimary === true || binding.is_primary === true,
    isValid: binding.isValid !== false && binding.is_valid !== false,
    createdAt: String(binding.createdAt || binding.created_at || '').trim(),
    updatedAt: String(binding.updatedAt || binding.updated_at || '').trim()
  }
}

function bindingToCredential (binding) {
  if (!binding) return null

  return normalizeCredential({
    frameworkToken: binding.frameworkToken,
    tgpId: binding.tgpId,
    isValid: binding.isValid,
    loginType: binding.loginType,
    updatedAt: binding.updatedAt,
    role: {
      id: binding.roleId,
      openid: binding.roleOpenid,
      name: binding.nickname,
      avatar: binding.avatar
    }
  })
}

function mergeCredential (baseCredential, overrideCredential = {}) {
  const base = normalizeCredential(baseCredential)
  if (!base) return null

  const merged = normalizeCredential({
    ...base,
    ...overrideCredential,
    frameworkToken: overrideCredential?.frameworkToken || base.frameworkToken,
    tgpId: overrideCredential?.tgpId || base.tgpId,
    isValid: overrideCredential?.isValid ?? base.isValid,
    isBind: overrideCredential?.isBind ?? base.isBind,
    loginType: overrideCredential?.loginType || base.loginType,
    updatedAt: overrideCredential?.updatedAt || base.updatedAt,
    role: {
      ...(base.role || {}),
      ...(overrideCredential?.role || {})
    }
  })

  return merged || base
}

export default class WeGameAccountService {
  constructor (e) {
    this.e = e
    this.api = new WeGameApi()
  }

  getUserIdentifier () {
    return String(this.e.user_id)
  }

  async getLocalCredential () {
    return getLastCredential(this.getUserIdentifier())
  }

  async saveLocalCredential (credential) {
    if (!credential?.frameworkToken) return null
    return saveLastCredential(this.getUserIdentifier(), credential)
  }

  hasApiKey () {
    return Boolean(String(Config.get('wegame', 'api_key') || '').trim())
  }

  async fetchBindings () {
    const data = await this.api.getUserBindings(this.getUserIdentifier())
    const bindings = Array.isArray(data?.bindings) ? data.bindings : []
    return bindings.map((item) => normalizeBinding(item)).filter(Boolean)
  }

  async tryRepairBindingFromLastCredential () {
    const lastCredential = await getLastCredential(this.getUserIdentifier())
    if (!lastCredential?.frameworkToken) {
      return
    }

    try {
      await this.api.getLoginToken(
        lastCredential.loginType || 'qq',
        lastCredential.frameworkToken,
        this.getUserIdentifier()
      )
    } catch (error) {}
  }

  async listBindings (options = {}) {
    const { attemptRepair = true } = options
    const bindings = await this.fetchBindings()

    if (bindings.length > 0 || !attemptRepair || !this.hasApiKey()) {
      return bindings
    }

    await this.tryRepairBindingFromLastCredential()
    return this.fetchBindings()
  }

  pickActiveBinding (bindings = []) {
    return bindings.find((item) => item.isPrimary && item.isValid) ||
      bindings.find((item) => item.isValid) ||
      bindings.find((item) => item.isPrimary) ||
      bindings[0] ||
      null
  }

  async findBindingByFrameworkToken (frameworkToken, options = {}) {
    const target = String(frameworkToken || '').trim()
    if (!target) return { binding: null, bindings: [] }

    const retries = Number(options.retries ?? 3)
    const intervalMs = Number(options.intervalMs ?? 600)

    for (let attempt = 0; attempt <= retries; attempt++) {
      const bindings = await this.listBindings({ attemptRepair: attempt === 0 })
      const binding = bindings.find((item) => item.frameworkToken === target) || null
      if (binding || attempt >= retries) {
        return { binding, bindings }
      }
      await sleep(intervalMs)
    }

    return { binding: null, bindings: [] }
  }

  async syncLoginCredential (payload) {
    const credential = normalizeCredential(payload)
    if (!credential) throw new Error('登录成功，但凭证数据不完整')

    await saveLastCredential(this.getUserIdentifier(), credential)

    try {
      const { binding, bindings } = await this.findBindingByFrameworkToken(credential.frameworkToken)

      if (binding?.id && !binding.isPrimary) {
        const switched = await this.switchPrimaryBinding(binding.id)
        const switchedCredential = mergeCredential(credential, switched.credential)

        return {
          credential: switchedCredential || credential,
          binding: switched.binding || binding,
          bindings: switched.bindings || bindings,
          autoSwitched: true
        }
      }

      return {
        credential: mergeCredential(credential, bindingToCredential(binding)) || credential,
        binding,
        bindings,
        autoSwitched: false
      }
    } catch (error) {
      return { credential, binding: null, bindings: [], autoSwitched: false }
    }
  }

  async resolveActiveCredential () {
    try {
      const bindings = await this.listBindings()
      const binding = this.pickActiveBinding(bindings)
      const credential = bindingToCredential(binding)

      if (credential?.frameworkToken) {
        await saveLastCredential(this.getUserIdentifier(), credential)
        return {
          source: 'binding',
          binding,
          credential,
          bindings
        }
      }
    } catch (error) {}

    const lastCredential = await getLastCredential(this.getUserIdentifier())
    if (lastCredential?.frameworkToken) {
      return {
        source: 'local',
        binding: null,
        credential: lastCredential
      }
    }

    throw new Error(`还没有可用的 WeGame 账号，请先发送 ${formatCommand('qq登陆')} 或 ${formatCommand('wx登陆')}`)
  }

  async switchPrimaryBinding (bindingId) {
    await this.api.setPrimaryBinding(bindingId, this.getUserIdentifier())

    const bindings = await this.listBindings()
    const requestedBinding = bindings.find((item) => item.id === String(bindingId || '').trim()) || null
    const binding = requestedBinding || this.pickActiveBinding(bindings)
    const credential = bindingToCredential(binding)

    if (credential?.frameworkToken) {
      await saveLastCredential(this.getUserIdentifier(), credential)
    } else {
      await setUserState(this.getUserIdentifier(), { lastCredential: null })
    }

    return {
      binding,
      credential,
      bindings
    }
  }

  async deleteBinding (bindingId) {
    await this.api.deleteUserBinding(bindingId, this.getUserIdentifier())

    const bindings = await this.listBindings()
    const binding = this.pickActiveBinding(bindings)
    const credential = bindingToCredential(binding)

    if (credential?.frameworkToken) {
      await saveLastCredential(this.getUserIdentifier(), credential)
    } else {
      await setUserState(this.getUserIdentifier(), { lastCredential: null })
    }

    return {
      binding,
      credential,
      bindings
    }
  }
}
