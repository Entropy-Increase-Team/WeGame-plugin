import cfg from '../../../lib/config/config.js'
import ModuleService from '../model/moduleService.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'

let updating = false
const AUTO_MODULE_UPDATE_DELAY_MS = 5 * 1000

function formatCommit(result = {}) {
  if (result.updated && result.beforeHead && result.afterHead) {
    return `${result.beforeHead} -> ${result.afterHead}`
  }

  return result.afterHead || result.beforeHead || '未知提交'
}

function sleep (ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNoInstalledModulesError (message = '') {
  return String(message || '').includes('当前没有已安装模块可更新')
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
          reg: buildCommandReg('更新(?:\\s+.*)?'),
          fnc: 'update',
          permission: 'master'
        }
      ]
    })

    this.e = e
  }

  init () {
    if (cfg.bot.update_time) {
      this.autoUpdateModulesTimer()
    }

    this.task = []
    if (cfg.bot.update_cron) {
      for (const cron of Array.isArray(cfg.bot.update_cron) ? cfg.bot.update_cron : [cfg.bot.update_cron]) {
        this.task.push({
          name: 'WeGame 模块定时更新',
          cron,
          fnc: () => this.autoUpdateModules({ delay: true })
        })
      }
    }
  }

  autoUpdateModulesTimer () {
    setTimeout(
      () => this.autoUpdateModules({ delay: true }).finally(this.autoUpdateModulesTimer.bind(this)),
      cfg.bot.update_time * 60000
    )
  }

  async autoUpdateModules (options = {}) {
    if (options.delay) {
      await sleep(AUTO_MODULE_UPDATE_DELAY_MS)
    }

    if (updating) {
      logger.mark('[WeGame-plugin] 自动模块更新跳过：已有更新任务进行中')
      return false
    }

    updating = true
    try {
      logger.mark('[WeGame-plugin] 开始自动更新已安装模块')
      const result = await ModuleService.updateInstalledModules()
      const failed = Number(result.failed || 0)
      const updated = Number(result.updated || 0)

      if (updated > 0 || failed > 0) {
        await Bot.sendMasterMsg(this.buildModuleReply(result))
      }

      logger.mark(`[WeGame-plugin] 自动模块更新完成：更新 ${updated} 个，失败 ${failed} 个`)
      return true
    } catch (error) {
      const message = error?.message || String(error)
      if (isNoInstalledModulesError(message)) {
        logger.mark('[WeGame-plugin] 自动模块更新跳过：当前没有已安装模块')
        return true
      }

      logger.error('[WeGame-plugin] 自动模块更新失败', error)
      await Bot.sendMasterMsg(`WeGame 模块自动更新失败：${message}`)
      return false
    } finally {
      updating = false
    }
  }

  async update () {
    if (!this.e.isMaster) return false

    if (updating) {
      await this.reply('当前已有更新任务进行中，请稍后再试。')
      return true
    }

    updating = true

    try {
      const moduleCode = this.extractModuleCode()

      if (moduleCode) {
        await this.reply(`正在更新模块：${moduleCode}`)
        const result = await ModuleService.updateInstalledModules(moduleCode)
        await this.reply(this.buildModuleReply(result, moduleCode))
        return true
      }

      await this.reply('正在更新 WeGame-plugin 核心与已安装模块...')
      const coreResult = await ModuleService.updateCorePlugin()
      const moduleResult = await this.updateAllModulesSafely()
      await this.reply(this.buildFullReply(coreResult, moduleResult))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 更新失败', error)
      await this.reply(`更新失败：${error.message || error}`)
      return true
    } finally {
      updating = false
    }
  }

  async updateAllModulesSafely () {
    try {
      return await ModuleService.updateInstalledModules()
    } catch (error) {
      const message = error?.message || String(error)
      if (!isNoInstalledModulesError(message)) {
        logger.error('[WeGame-plugin] 模块更新失败', error)
      }
      return {
        ok: false,
        error: message,
        results: []
      }
    }
  }

  extractModuleCode () {
    const raw = stripCommandPrefix(this.e.msg, '更新')
    return String(raw || '').trim().split(/\s+/)[0] || ''
  }

  buildFullReply (coreResult = {}, moduleResult = {}) {
    return [
      this.buildCoreReply(coreResult),
      '',
      this.buildModuleReply(moduleResult)
    ].join('\n')
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

    if (payload.ok === false) {
      lines.push(payload.error || '模块更新失败')
      lines.push(`可指定单模块：${formatCommand('更新 rocom')}`)
      return lines.join('\n')
    }

    if (results.length === 0) {
      lines.push('当前没有可更新模块。')
      lines.push(`可指定单模块：${formatCommand('更新 rocom')}`)
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

    lines.push(`可指定单模块：${formatCommand('更新 rocom')}`)

    return lines.join('\n')
  }
}
