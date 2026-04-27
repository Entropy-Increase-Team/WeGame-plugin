import common from '../../../lib/common/common.js'
import Config from '../utils/config.js'
import ModuleService from '../model/moduleService.js'
import WeGameAccountService from '../model/accountService.js'
import WeGameApi from '../model/api.js'
import { normalizeCredential } from '../model/store.js'
import {
  buildQrSegment,
  formatExpireTime,
  getLoginTypeLabel,
  getPlatformLabel,
  getStatusText,
  normalizeLoginStatus,
  normalizePlatform
} from '../utils/common.js'
import {
  COMMAND_PREFIXES,
  DEFAULT_COMMAND_PREFIX,
  formatCommand,
  stripCommandPrefix
} from '../utils/command.js'

function escapeRegExp (value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildPrefixPattern (prefixes = []) {
  const values = [...new Set((Array.isArray(prefixes) ? prefixes : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  )]

  return values.length > 0
    ? `(?:${values.map((item) => escapeRegExp(item)).join('|')})`
    : '(?!)'
}

function getModuleCommandPrefixes () {
  return ModuleService
    .getInstalledModuleCommandPrefixes()
    .filter((item) => !COMMAND_PREFIXES.includes(item))
}

function buildLoginCommandReg () {
  return `^${buildPrefixPattern([...COMMAND_PREFIXES, ...getModuleCommandPrefixes()])}\\s*(微信|wx|WX|QQ|qq)(登陆|登录)$`
}

function buildWeGameNamespacedReg (bodyPattern = '') {
  const corePattern = buildPrefixPattern(COMMAND_PREFIXES)
  const modulePattern = buildPrefixPattern(getModuleCommandPrefixes())
  return `^(?:(?:${corePattern}\\s*(?:wg\\s*)?${bodyPattern})|(?:${modulePattern}\\s*wg\\s*${bodyPattern}))$`
}

function stripWeGameCommandPrefix (message = '', commandLiteral = '') {
  const text = String(message || '').trim()
  const command = escapeRegExp(commandLiteral)
  const patterns = [
    new RegExp(`^${buildPrefixPattern(COMMAND_PREFIXES)}\\s*(?:wg\\s*)?${command}(?:\\s+|$)`),
    new RegExp(`^${buildPrefixPattern(getModuleCommandPrefixes())}\\s*wg\\s*${command}(?:\\s+|$)`)
  ]

  for (const pattern of patterns) {
    const matched = text.match(pattern)
    if (matched) {
      return text.slice(matched[0].length).trim()
    }
  }

  return ''
}

const LOGIN_COMMAND_REG = buildLoginCommandReg()
const ACTIVE_LOGIN_SESSIONS = new Map()
const RECENT_LOGIN_NOTICES = new Map()
const LOGIN_NOTICE_DEDUP_MS = 8000

export class WeGameLogin extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin] 登录与账号',
      dsc: 'WeGame 登录和账号管理',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: LOGIN_COMMAND_REG,
          fnc: 'login'
        },
        {
          reg: buildWeGameNamespacedReg('账号列表'),
          fnc: 'listAccounts'
        },
        {
          reg: buildWeGameNamespacedReg('切换账号(?:\\s+.+)?'),
          fnc: 'switchAccount'
        },
        {
          reg: buildWeGameNamespacedReg('删除账号(?:\\s+.+)?'),
          fnc: 'deleteAccount'
        }
      ]
    })

    this.e = e
    this.api = new WeGameApi()
    this.accountService = new WeGameAccountService(e)
    this.recalledMessageIds = new Set()
    this.loginReplyMessageIds = new Set()
  }

  getActiveCommandPrefix () {
    const text = String(this.e?.msg || '').trim()
    const prefixes = [...getModuleCommandPrefixes(), ...COMMAND_PREFIXES]
      .sort((left, right) => right.length - left.length)

    return prefixes.find((prefix) => text.startsWith(prefix)) || DEFAULT_COMMAND_PREFIX
  }

  isModulePrefixedCommand () {
    return getModuleCommandPrefixes().includes(this.getActiveCommandPrefix())
  }

  formatWeGameCommand (command = '', options = {}) {
    const text = String(command || '').trim()
    if (!this.isModulePrefixedCommand()) {
      return formatCommand(text)
    }

    const namespace = options.namespaced ? 'wg' : ''
    return `${this.getActiveCommandPrefix()}${namespace}${text}`
  }

  async login () {
    const match = this.e.msg.match(this.rule[0].reg)
    const platform = normalizePlatform(match?.[1])
    const platformLabel = getPlatformLabel(platform)
    const userIdentifier = this.accountService.getUserIdentifier()
    const sessionKey = this.getSessionKey(userIdentifier)

    if (ACTIVE_LOGIN_SESSIONS.has(sessionKey)) {
      await this.replyDeduplicated('当前已有登录流程进行中，请先完成扫码或等待结束。', userIdentifier)
      return true
    }

    ACTIVE_LOGIN_SESSIONS.set(sessionKey, {
      platform,
      startedAt: Date.now()
    })
    this.recalledMessageIds.clear()
    this.loginReplyMessageIds.clear()

    try {
      const qrData = await this.api.getLoginQr(platform, userIdentifier)
      if (!qrData?.frameworkToken || !qrData?.qr_image) {
        throw new Error('接口未返回完整二维码信息')
      }

      const qrReply = await this.reply(this.buildQrReply(platform, qrData))
      this.collectReplyMessageIds(qrReply)
      const credential = await this.pollLoginResult(platform, qrData.frameworkToken, userIdentifier)
      const normalized = normalizeCredential(credential)

      if (!normalized) {
        throw new Error('登录成功，但返回的凭证数据不完整')
      }

      const syncResult = await this.accountService.syncLoginCredential(normalized)
      await this.reply(this.buildSuccessReply(syncResult))
      return true
    } catch (error) {
      logger.error(`[WeGame-plugin] ${platformLabel}登录失败`, error)
      await this.recallLoginMessages(false)
      await this.replyDeduplicated(`${platformLabel}登录失败：${error.message || error}`, userIdentifier)
      return true
    } finally {
      ACTIVE_LOGIN_SESSIONS.delete(sessionKey)
    }
  }

  buildQrReply (platform, qrData) {
    const platformLabel = getPlatformLabel(platform)
    const expireText = formatExpireTime(qrData.expire)
    const { segmentData, fallbackText } = buildQrSegment(qrData.qr_image)

    const msg = []
    if (this.e.isGroup) {
      msg.push(segment.at(this.e.user_id), '\n')
    }

    msg.push(
      `请使用另外一台设备的${platformLabel}扫描下方二维码完成 WeGame 登录。`,
      `\n二维码过期时间：${expireText}`,
      '\n登录成功后会自动同步到账号绑定列表。',
      '\n\n【免责声明】',
      '\n您将通过扫码授权本插件后端服务器获取您的游戏数据。',
      '\n扫码仅用于获取WeGame数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。'
    )

    if (segmentData) {
      msg.push('\n', segmentData)
    }

    if (fallbackText) {
      msg.push('\n', fallbackText)
    }

    return msg
  }

  async pollLoginResult (platform, frameworkToken, userIdentifier = '') {
    const timeoutMs = Number(Config.get('wegame', 'login_timeout_ms')) || 180000
    const intervalMs = Number(Config.get('wegame', 'login_poll_interval_ms')) || 2000
    const startTime = Date.now()
    let lastNoticeStatus = ''

    while (Date.now() - startTime < timeoutMs) {
      const statusData = await this.api.getLoginStatus(platform, frameworkToken, userIdentifier)
      const status = normalizeLoginStatus(statusData)

      if (status && status !== lastNoticeStatus && status === 'scanned') {
        lastNoticeStatus = status
        await this.recallLoginMessages(true)
        const statusReply = await this.reply(`${getPlatformLabel(platform)}二维码状态：${getStatusText(status)}。`)
        this.collectReplyMessageIds(statusReply)
      }

      if (status === 'done') {
        await this.recallLoginMessages(true)
        return this.api.getLoginToken(platform, frameworkToken, userIdentifier)
      }

      if (status === 'expired') {
        await this.recallLoginMessages(false)
        throw new Error('二维码已过期，请重新发送登录指令')
      }

      await Bot.sleep(intervalMs)
    }

    await this.recallLoginMessages(false)
    throw new Error('等待扫码结果超时，请重新发送登录指令')
  }

  getSessionKey (userIdentifier = '') {
    return `${this.e.self_id || 'bot'}:${String(userIdentifier || this.e.user_id || '').trim()}`
  }

  async replyDeduplicated (message, userIdentifier = '') {
    const text = String(message || '').trim()
    if (!text) return false

    const dedupeKey = `${this.getSessionKey(userIdentifier)}:${text}`
    const now = Date.now()
    const lastAt = RECENT_LOGIN_NOTICES.get(dedupeKey) || 0

    if (now - lastAt < LOGIN_NOTICE_DEDUP_MS) {
      return false
    }

    RECENT_LOGIN_NOTICES.set(dedupeKey, now)
    await this.reply(text)
    return true
  }

  collectReplyMessageIds (replyResult) {
    const ids = this.normalizeMessageIds(replyResult?.message_id)
    for (const id of ids) {
      this.loginReplyMessageIds.add(id)
    }
  }

  normalizeMessageIds (messageId) {
    if (Array.isArray(messageId)) {
      return messageId.map((id) => String(id || '').trim()).filter(Boolean)
    }

    const single = String(messageId || '').trim()
    return single ? [single] : []
  }

  async recallLoginMessages (includeSource = false) {
    for (const messageId of this.loginReplyMessageIds) {
      await this.recallMessage(messageId)
    }

    if (includeSource) {
      await this.recallMessage(this.e.message_id)
    }
  }

  async recallMessage (messageId) {
    const recallTarget = this.e.group?.recallMsg || this.e.friend?.recallMsg
    const targetIds = this.normalizeMessageIds(messageId)

    if (!recallTarget || targetIds.length === 0) {
      return
    }

    for (const targetId of targetIds) {
      if (this.recalledMessageIds.has(targetId)) {
        continue
      }

      try {
        await recallTarget(targetId)
        this.recalledMessageIds.add(targetId)
      } catch (error) {}
    }
  }

  async listAccounts () {
    try {
      const bindings = await this.accountService.listBindings()
      if (bindings.length === 0) {
        await this.reply(`当前还没有已绑定的 WeGame 账号，请先发送 ${this.formatWeGameCommand('qq登陆')} 或 ${this.formatWeGameCommand('wx登陆')}`)
        return true
      }

      const nodes = bindings.map((binding, index) => this.buildBindingCard(binding, index, bindings.length))
      const forwardMsg = await common.makeForwardMsg(this.e, nodes, 'WeGame 绑定列表')
      await this.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 查询账号列表失败', error)
      await this.reply(`查询账号列表失败：${error.message || error}`)
      return true
    }
  }

  async switchAccount () {
    try {
      const bindings = await this.accountService.listBindings()
      if (bindings.length === 0) {
        throw new Error(`当前还没有已绑定的 WeGame 账号，请先发送 ${this.formatWeGameCommand('qq登陆')} 或 ${this.formatWeGameCommand('wx登陆')}`)
      }

      const target = this.resolveBindingTarget(bindings, this.extractBindingTargetArg('切换'))
      if (target.isPrimary) {
        await this.reply(`当前默认账号已经是「${this.getBindingName(target)}」了`)
        return true
      }

      const result = await this.accountService.switchPrimaryBinding(target.id)
      const current = result.binding || target

      await this.reply([
        `已切换默认账号为：${this.getBindingName(current)}`,
        `登录方式：${getLoginTypeLabel(current.loginType)}`,
        `角色ID：${current.roleId || '未返回'}`,
        '后续游戏模块查询会优先使用这个账号。'
      ].join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 切换账号失败', error)
      await this.reply(`切换账号失败：${error.message || error}`)
      return true
    }
  }

  async deleteAccount () {
    try {
      const bindings = await this.accountService.listBindings()
      if (bindings.length === 0) {
        throw new Error('当前还没有已绑定的 WeGame 账号')
      }

      const target = this.resolveBindingTarget(bindings, this.extractBindingTargetArg('删除'))
      const result = await this.accountService.deleteBinding(target.id)
      const current = result.binding

      const lines = [
        `已删除账号：${this.getBindingName(target)}`,
        `登录方式：${getLoginTypeLabel(target.loginType)}`,
        `剩余绑定数量：${result.bindings.length}`
      ]

      if (current) {
        lines.push(`当前默认账号：${this.getBindingName(current)}`)
      } else {
        lines.push('当前已没有可用绑定账号。')
      }

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 删除账号失败', error)
      await this.reply(`删除账号失败：${error.message || error}`)
      return true
    }
  }

  extractBindingTargetArg (action = '切换') {
    const raw = stripWeGameCommandPrefix(this.e.msg, `${action}账号`) || stripCommandPrefix(this.e.msg, `${action}账号`)
    if (!raw) {
      throw new Error(`格式：${this.formatWeGameCommand(`${action}账号 <序号>`, { namespaced: true })}`)
    }
    return raw
  }

  resolveBindingTarget (bindings = [], rawTarget = '') {
    const normalized = String(rawTarget || '').trim()
    if (!normalized) {
      throw new Error('未提供账号标识')
    }

    if (!/^\d+$/.test(normalized)) {
      throw new Error(`账号序号格式不正确，请先发送 ${this.formatWeGameCommand('账号列表', { namespaced: true })} 查看序号`)
    }

    const index = Number(normalized)
    if (index >= 1 && index <= bindings.length) {
      return bindings[index - 1]
    }

    throw new Error(`未找到对应账号，请先发送 ${this.formatWeGameCommand('账号列表', { namespaced: true })} 查看序号`)
  }

  getBindingName (binding = {}) {
    return binding.nickname || binding.roleId || binding.tgpId || '未命名账号'
  }

  formatBindingTime (value) {
    const text = String(value || '').trim()
    if (!text) return '未返回'

    const date = new Date(text)
    if (Number.isNaN(date.getTime())) {
      return text
    }

    const pad = (num) => String(num).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }

  buildBindingCard (binding, index, total) {
    const tags = []
    if (binding.isPrimary) tags.push('主账号')
    tags.push(binding.isValid ? '有效' : '失效')

    const lines = [
      `序号：${index + 1}/${total}`,
      `显示名：${this.getBindingName(binding)}`,
      `状态：${tags.join(' | ')}`,
      `登录方式：${getLoginTypeLabel(binding.loginType)}`,
      `TGP ID：${binding.tgpId || '未返回'}`,
      `更新时间：${this.formatBindingTime(binding.updatedAt)}`
    ]

    if (binding.roleId) {
      lines.push(`角色ID：${binding.roleId}`)
    }

    if (index === total - 1) {
      lines.push('')
      lines.push('说明：这里只展示 WeGame 绑定信息，具体游戏角色资料请使用对应游戏模块查询。')
      lines.push(`切换：${this.formatWeGameCommand('切换账号 <序号>', { namespaced: true })}`)
      lines.push(`删除：${this.formatWeGameCommand('删除账号 <序号>', { namespaced: true })}`)
    }

    return lines.join('\n')
  }

  buildStatusText (binding = {}, credential = {}) {
    const tags = []
    if (binding.isPrimary) tags.push('主账号')
    tags.push(binding.isValid !== undefined ? (binding.isValid ? '有效' : '失效') : (credential.isValid ? '有效' : '失效'))
    return tags.join(' | ')
  }

  buildSuccessReply (syncResult = {}) {
    const credential = syncResult.credential || {}
    const binding = syncResult.binding || {}
    const role = credential.role || {}
    const lines = ['登录成功。']

    const nickname = binding.nickname || role.name || '未返回'
    const wegameId = binding.tgpId || credential.tgpId || '未返回'
    if (nickname !== '未返回') {
      lines.push(`昵称：${nickname}`)
    } else {
      lines.push(`WeGameID：${wegameId}`)
    }
    lines.push(`状态：${this.buildStatusText(binding, credential)}`)
    lines.push(`登录方式：${getLoginTypeLabel(binding.loginType || credential.loginType)}`)

    const roleId = role.id || binding.roleId
    if (roleId) {
      lines.push(`角色ID：${roleId}`)
    }

    if (String(Config.get('wegame', 'api_key') || '').trim()) {
      lines.push(`可发送 ${this.formatWeGameCommand('账号列表', { namespaced: true })} 查看已绑定账号。`)
    } else {
      lines.push('如需账号列表与切换账号，请先在 wgconfig.yaml 中填写 wegame.api_key。')
    }

    return lines.join('\n')
  }
}
