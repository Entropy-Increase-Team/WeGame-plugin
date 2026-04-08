import common from '../../../lib/common/common.js'
import { getLoginTypeLabel, maskValue } from './common.js'

const MAX_TEXT_REPLY_LENGTH = 1600
const FORWARD_CHUNK_LENGTH = 1200

function ensureUpstreamSuccess (data = {}) {
  const errorCode = Number(data?.result?.error_code ?? 0)
  if (Number.isNaN(errorCode) || errorCode === 0) return

  const message = String(data?.result?.error_message || `上游返回错误码 ${errorCode}`)
  throw new Error(message)
}

function displayValue (plugin, value, maskInGroup = true) {
  if (value === null || value === undefined || value === '') return '未返回'
  if (typeof value === 'string' && maskInGroup) {
    return maskValue(value, plugin.e.isGroup)
  }
  return String(value)
}

function buildObjectLines (plugin, payload, ignoredKeys = [], prefix = '', depth = 0) {
  if (!payload || typeof payload !== 'object' || depth > 1) return []

  const lines = []
  const entries = Object.entries(payload)
    .filter(([key]) => !ignoredKeys.includes(key))
    .slice(0, 12)

  for (const [key, value] of entries) {
    const label = prefix ? `${prefix}${key}` : key
    if (value === null || value === undefined || value === '') continue

    if (Array.isArray(value)) {
      lines.push(`${label}：${value.length} 项`)
      if (value.length > 0 && typeof value[0] === 'object' && depth < 1) {
        lines.push(...buildObjectLines(plugin, value[0], [], `${label}.`, depth + 1))
      }
      continue
    }

    if (typeof value === 'object') {
      lines.push(`${label}：`)
      lines.push(...buildObjectLines(plugin, value, [], `${label}.`, depth + 1))
      continue
    }

    lines.push(`${label}：${displayValue(plugin, value, false)}`)
  }

  return lines
}

function formatRoleProfile (plugin, data, credential) {
  const role = data?.role || credential?.role || {}
  return [
    '角色资料',
    `角色：${displayValue(plugin, role.name, false)}`,
    `角色 ID：${displayValue(plugin, role.id, false)}`,
    `OpenID：${displayValue(plugin, role.openid)}`,
    `TGP ID：${displayValue(plugin, credential?.tgpId)}`,
    `登录类型：${displayValue(plugin, getLoginTypeLabel(credential?.loginType), false)}`,
    `等级：${displayValue(plugin, role.level, false)}`,
    `星级：${displayValue(plugin, role.star, false)}`,
    `在线状态：${role.is_online === null || role.is_online === undefined ? '未返回' : Number(role.is_online) === 1 ? '在线' : '离线'}`,
    `创建时间：${displayValue(plugin, role.create_time, false)}`,
    `头像：${displayValue(plugin, role.avatar, false)}`
  ].join('\n')
}

function formatGenericPayload (plugin, title, data) {
  const lines = [title]
  const summaryLines = buildObjectLines(plugin, data, ['result'])

  if (summaryLines.length > 0) {
    lines.push(...summaryLines)
  } else {
    lines.push('接口已返回数据，但暂未识别出可读摘要字段。')
  }

  const rawText = JSON.stringify(data, null, 2)
  if (rawText && rawText !== '{}') {
    lines.push('')
    lines.push('原始摘要：')
    lines.push(rawText.length > 800 ? `${rawText.slice(0, 800)}\n...` : rawText)
  }

  return lines.join('\n')
}

async function replyLargeText (plugin, title, text) {
  if (text.length <= MAX_TEXT_REPLY_LENGTH) {
    await plugin.reply(text)
    return
  }

  const chunks = []
  for (let i = 0; i < text.length; i += FORWARD_CHUNK_LENGTH) {
    chunks.push(text.slice(i, i + FORWARD_CHUNK_LENGTH))
  }

  await plugin.reply(common.makeForwardMsg(plugin.e, chunks, title))
}

export {
  displayValue,
  ensureUpstreamSuccess,
  formatGenericPayload,
  formatRoleProfile,
  replyLargeText
}
