import ModuleService from '../model/moduleService.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'

let updating = false

function formatCommit(result = {}) {
  if (result.updated && result.beforeHead && result.afterHead) {
    return `${result.beforeHead} -> ${result.afterHead}`
  }

  return result.afterHead || result.beforeHead || '未知提交'
}

export class WeGameUpdate extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin] 更新',
      dsc: 'WeGame 核心与模块更新',
      event: 'message',
      priority: 95,
      rule: [
        {
          reg: buildCommandReg('模块更新(?:\\s+.*)?'),
          fnc: 'updateModules',
          permission: 'master'
        },
        {
          reg: buildCommandReg('更新'),
          fnc: 'updateCore',
          permission: 'master'
        }
      ]
    })

    this.e = e
  }

  async updateCore () {
    if (!this.e.isMaster) return false

    if (updating) {
      await this.reply('当前已有更新任务进行中，请稍后再试。')
      return true
    }

    updating = true

    try {
      await this.reply('正在更新 WeGame-plugin 核心...')
      const result = await ModuleService.updateCorePlugin()
      await this.reply(this.buildCoreReply(result))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 核心更新失败', error)
      await this.reply(`更新失败：${error.message || error}`)
      return true
    } finally {
      updating = false
    }
  }

  async updateModules () {
    if (!this.e.isMaster) return false

    if (updating) {
      await this.reply('当前已有更新任务进行中，请稍后再试。')
      return true
    }

    const raw = stripCommandPrefix(this.e.msg, '模块更新')
    const moduleCode = String(raw || '').trim().split(/\s+/)[0] || ''

    updating = true

    try {
      await this.reply(moduleCode
        ? `正在更新模块：${moduleCode}`
        : '正在更新已安装模块...'
      )

      const result = await ModuleService.updateInstalledModules(moduleCode)
      await this.reply(this.buildModuleReply(result, moduleCode))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 模块更新失败', error)
      await this.reply(`模块更新失败：${error.message || error}`)
      return true
    } finally {
      updating = false
    }
  }

  buildCoreReply (result = {}) {
    const lines = [
      result.updated ? 'WeGame-plugin 更新成功' : 'WeGame-plugin 已是最新'
    ]

    if (result.branch) {
      lines.push(`分支：${result.branch}`)
    }

    lines.push(`提交：${formatCommit(result)}`)

    if (result.updatedAt) {
      lines.push(`最后提交时间：${result.updatedAt}`)
    }

    if (result.updated) {
      lines.push('请重启 Yunzai 或重载插件使更新生效。')
    }

    return lines.join('\n')
  }

  buildModuleReply (payload = {}, moduleCode = '') {
    const results = Array.isArray(payload.results) ? payload.results : []
    const lines = [moduleCode ? `模块更新结果：${moduleCode}` : '模块更新结果']

    if (results.length === 0) {
      lines.push('当前没有可更新模块。')
      return lines.join('\n')
    }

    for (const item of results) {
      const name = item.name || item.code || '未命名模块'

      if (item.ok === false) {
        lines.push(`- ${name} | 失败 | ${item.error || '未知错误'}`)
        continue
      }

      lines.push(`- ${name} | ${item.updated ? '已更新' : '已是最新'} | ${formatCommit(item)}`)
    }

    if (!moduleCode) {
      lines.push(`共 ${payload.total || results.length} 个模块，更新 ${payload.updated || 0} 个，失败 ${payload.failed || 0} 个。`)
    }

    if (results.some((item) => item.ok !== false && item.updated)) {
      lines.push(`如需立即生效，请重启 Yunzai 或重载插件。`)
    }

    lines.push(`可指定单模块：${formatCommand('模块更新 rocom')}`)

    return lines.join('\n')
  }
}
