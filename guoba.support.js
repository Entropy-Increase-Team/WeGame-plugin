import fs from 'node:fs'
import path from 'node:path'
import Config from './utils/config.js'
import ModuleService from './model/moduleService.js'
import { pluginRoot } from './model/path.js'

function setByPath (target, keyPath, value) {
  const segments = String(keyPath || '').split('.').filter(Boolean)
  if (segments.length === 0) return target

  let cursor = target
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (cursor[key] == null || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }
  cursor[segments[segments.length - 1]] = value
  return target
}

async function loadModuleSupports () {
  const supports = []

  for (const moduleItem of ModuleService.getInstalledModules()) {
    const supportPath = path.join(pluginRoot, 'modules', moduleItem.code, 'guoba.support.js')
    if (!fs.existsSync(supportPath)) continue

    try {
      const mod = await import(`./modules/${moduleItem.code}/guoba.support.js`)
      const support = mod?.default
      if (!support || !Array.isArray(support.schemas)) continue

      supports.push({
        code: moduleItem.code,
        title: support.title || moduleItem.name || moduleItem.code,
        description: moduleItem.description || '',
        version: moduleItem.version || '',
        topKeys: Array.isArray(support.topKeys) ? support.topKeys : [],
        schemas: support.schemas,
        getConfigData: typeof support.getConfigData === 'function' ? support.getConfigData : () => ({}),
        setConfigData: typeof support.setConfigData === 'function' ? support.setConfigData : () => {}
      })
    } catch (error) {
      logger.error(`[WeGame-plugin] 载入模块锅巴配置失败：${moduleItem.code}`, error)
    }
  }

  return supports
}

// 锅巴前端把 SOFT_GROUP_BEGIN 当 Tab 渲染（每个 group 一个标签页）。
// 我们的层次设计：
//   · 每个「模块/插件」一个 Tab，用 SOFT_GROUP_BEGIN 标题为模块名
//   · 模块内部原来的 SOFT_GROUP_BEGIN 全部转成 Divider，作为同一页面内的分组横线
function buildModuleSchemas (supports) {
  if (!supports.length) return []

  const result = []
  for (const support of supports) {
    const headerLabel = support.version
      ? `${support.title} · v${support.version}`
      : support.title

    result.push({
      component: 'SOFT_GROUP_BEGIN',
      label: headerLabel
    })

    for (const item of support.schemas) {
      if (item && item.component === 'SOFT_GROUP_BEGIN') {
        result.push({
          component: 'Divider',
          label: item.label,
          helpMessage: item.bottomHelpMessage || item.helpMessage
        })
        continue
      }
      result.push(item)
    }
  }

  return result
}

// 主插件自身的配置（wgconfig.yaml）
function buildCoreSupport () {
  const TOP_KEYS = ['wegame']

  const schemas = [
    {
      component: 'SOFT_GROUP_BEGIN',
      label: '后端连接'
    },
    {
      field: 'wegame.base_url',
      label: '后端地址',
      bottomHelpMessage: 'WeGame 后端地址，结尾不要带 /',
      component: 'Input',
      required: true,
      componentProps: {
        placeholder: 'https://wegame.shallow.ink'
      }
    },
    {
      field: 'wegame.api_key',
      label: 'API Key',
      bottomHelpMessage: '开发者 API Key（scope=wegame）。留空时使用匿名令牌，仅可访问无需鉴权的接口。',
      component: 'InputPassword',
      componentProps: {
        placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        autocomplete: 'new-password'
      }
    },
    {
      component: 'SOFT_GROUP_BEGIN',
      label: '客户端身份'
    },
    {
      field: 'wegame.client_type',
      label: '客户端类型',
      bottomHelpMessage: 'Yunzai 机器人请保持 bot',
      component: 'Select',
      componentProps: {
        options: [
          { label: 'bot（机器人）', value: 'bot' },
          { label: 'app（移动 / 桌面客户端）', value: 'app' },
          { label: 'web（网页）', value: 'web' }
        ]
      }
    },
    {
      field: 'wegame.client_id',
      label: '客户端实例 ID',
      bottomHelpMessage: '区分多机器人实例时使用，可留空',
      component: 'Input',
      componentProps: {
        placeholder: '例如 yunzai-bot-01'
      }
    },
    {
      field: 'wegame.device_fingerprint',
      label: '设备指纹',
      bottomHelpMessage: '留空时根据机器信息自动生成',
      component: 'Input',
      componentProps: {
        placeholder: 'yunzai_xxxxxxxxx_abcdef1234567890'
      }
    },
    {
      component: 'SOFT_GROUP_BEGIN',
      label: '超时与轮询'
    },
    {
      field: 'wegame.request_timeout_ms',
      label: '请求超时（毫秒）',
      bottomHelpMessage: 'HTTP 请求最长等待时间，默认 15000',
      component: 'InputNumber',
      componentProps: {
        min: 1000,
        step: 1000,
        placeholder: '15000'
      }
    },
    {
      field: 'wegame.login_poll_interval_ms',
      label: '登录轮询间隔（毫秒）',
      bottomHelpMessage: '扫码登录状态轮询频率，默认 2000',
      component: 'InputNumber',
      componentProps: {
        min: 500,
        step: 500,
        placeholder: '2000'
      }
    },
    {
      field: 'wegame.login_timeout_ms',
      label: '登录超时（毫秒）',
      bottomHelpMessage: '等待扫码完成的总超时，默认 180000',
      component: 'InputNumber',
      componentProps: {
        min: 10000,
        step: 10000,
        placeholder: '180000'
      }
    }
  ]

  return {
    code: 'wegame-core',
    title: 'WeGame 主插件',
    description: '主插件后端连接、客户端身份与超时配置（config/config/wgconfig.yaml）',
    version: '',
    topKeys: TOP_KEYS,
    schemas,
    getConfigData () {
      const config = Config.getConfig() || {}
      const output = {}
      for (const key of TOP_KEYS) {
        output[key] = config[key] || {}
      }
      return output
    },
    setConfigData (partial = {}) {
      const current = Config.getConfig() || {}
      const next = { ...current }
      for (const key of TOP_KEYS) {
        if (partial[key] === undefined) continue
        next[key] = { ...(current[key] || {}), ...(partial[key] || {}) }
      }
      Config.setConfig(next)
    }
  }
}

// 锅巴调用 supportGuoba() 时不会 await，因此必须返回同步对象。
// 这里在模块加载阶段（顶层 await）就把所有 module 的 guoba.support 预加载好。
const moduleSupports = [buildCoreSupport(), ...(await loadModuleSupports())]

export function supportGuoba () {
  const schemas = buildModuleSchemas(moduleSupports)

  return {
    pluginInfo: {
      name: 'wegame-plugin',
      title: 'WeGame 插件',
      author: '@Entropy-Increase-Team',
      authorLink: 'https://github.com/Entropy-Increase-Team',
      link: 'https://github.com/Entropy-Increase-Team/WeGame-plugin',
      isV3: true,
      isV2: false,
      description: '基于 Yunzai 的 WeGame 平台插件，支持核心登录能力与可扩展游戏模块',
      icon: 'mdi:gamepad-variant',
      iconColor: '#3a87ad'
    },
    configInfo: {
      schemas,

      async getConfigData () {
        const data = {}
        for (const support of moduleSupports) {
          try {
            const part = await support.getConfigData()
            Object.assign(data, part || {})
          } catch (error) {
            logger.error(`[WeGame-plugin] 读取模块锅巴配置失败：${support.code}`, error)
          }
        }
        return data
      },

      async setConfigData (data, { Result }) {
        const nested = {}
        for (const [keyPath, value] of Object.entries(data || {})) {
          setByPath(nested, keyPath, value)
        }

        for (const support of moduleSupports) {
          const partial = {}
          let hasUpdate = false

          for (const key of support.topKeys) {
            if (nested[key] !== undefined) {
              partial[key] = nested[key]
              hasUpdate = true
            }
          }

          if (!hasUpdate) continue

          try {
            await support.setConfigData(partial)
          } catch (error) {
            logger.error(`[WeGame-plugin] 写入模块锅巴配置失败：${support.code}`, error)
            return Result.error(`保存模块 ${support.code} 配置失败：${error?.message || error}`)
          }
        }

        return Result.ok({}, '保存成功~')
      }
    }
  }
}
