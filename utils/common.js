function normalizePlatform (input, fallback = 'qq') {
  const value = String(input || '').trim().toLowerCase()
  if (value === 'qq') return 'qq'
  if (value === 'wx' || value === 'wechat' || value === '微信') return 'wechat'
  return fallback
}

function getPlatformLabel (platform) {
  return platform === 'wechat' ? '微信' : 'QQ'
}

function normalizeCredentialProvider (value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized) return normalized
  if (!fallback) return ''
  return normalizeCredentialProvider(fallback, '')
}

function getLoginTypeLabel (loginType) {
  const value = String(loginType || '').trim().toLowerCase()
  if (value === 'qq') return 'QQ扫码'
  if (value === 'wechat') return '微信扫码'
  if (value === 'manual') return '手动导入'
  return value || '未返回'
}

function maskValue (value, isGroup = false, options = {}) {
  const str = String(value || '').trim()
  if (!str) return '未返回'

  const start = Number(options.start ?? 4)
  const end = Number(options.end ?? 4)
  if (!isGroup || str.length <= start + end) return str

  return `${str.slice(0, start)}****${str.slice(-end)}`
}

function formatExpireTime (expire) {
  if (!expire) return '约 2 分钟'
  const date = new Date(Number(expire))
  if (Number.isNaN(date.getTime())) return String(expire)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function normalizeLoginStatus (payload = {}) {
  const status = String(payload.status || '').trim().toLowerCase()
  if (status) return status

  const code = Number(payload.code)
  if (code === 0) return 'done'
  if (code === 1) return 'pending'
  if (code === 2) return 'scanned'
  if (code === 3) return 'processing'
  if (code === -2) return 'expired'

  return ''
}

function getStatusText (status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'pending') return '等待扫码'
  if (normalized === 'scanned') return '已扫码，等待手机确认'
  if (normalized === 'processing') return '已确认，正在换取 WeGame 凭证'
  if (normalized === 'done') return '登录成功'
  if (normalized === 'expired') return '二维码已过期'
  return normalized || '状态未知'
}

function buildQrSegment (qrImage) {
  const text = String(qrImage || '').trim()
  if (!text) {
    return { segmentData: null, fallbackText: '' }
  }

  if (/^data:image\/\w+;base64,/.test(text)) {
    const base64 = text.replace(/^data:image\/\w+;base64,/, '')
    return {
      segmentData: segment.image(`base64://${base64}`),
      fallbackText: ''
    }
  }

  return {
    segmentData: segment.image(text),
    fallbackText: `若二维码未显示，请直接打开：\n${text}`
  }
}

export {
  buildQrSegment,
  formatExpireTime,
  getLoginTypeLabel,
  getPlatformLabel,
  getStatusText,
  maskValue,
  normalizeCredentialProvider,
  normalizeLoginStatus,
  normalizePlatform
}
