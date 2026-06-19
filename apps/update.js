import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ModuleService from '../model/moduleService.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { Restart } from '../../other/restart.js'

const pluginName = 'WeGame-plugin'
const allModuleTargets = new Set(['模块', '全部模块', 'module', 'modules', 'all'])

let CoreUpdate = null
let moduleUpdating = false

async function loadOtherUpdate () {
  if (CoreUpdate) return CoreUpdate

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const otherUpdatePath = path.join(currentDir, '..', '..', 'other', 'update.js')
    const mod = await import(pathToFileURL(otherUpdatePath).href)
    CoreUpdate = mod?.update ?? mod?.default
  } catch (error) {
    logger?.warn?.('[WeGame-plugin] 未找到 plugins/other/update.js，插件更新命令不可用')
  }

  return CoreUpdate
}

function formatCommit (result = {}) {
  if (result.updated && result.beforeHead && result.afterHead) {
    return `${result.beforeHead} -> ${result.afterHead}`
  }

  return result.afterHead || result.beforeHead || '未知提交'
}

function isNoInstalledModulesError (message = '') {
  return String(message || '').includes('当前没有已安装模块可更新')
}

function isAllModuleTarget (target = '') {
  return allModuleTargets.has(String(target || '').trim().toLowerCase())
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
        },
        {
          reg: buildCommandReg('强制更新(?:\\s+.*)?'),
          fnc: 'forceUpdate',
          permission: 'master'
        }
      ]
    })

    this.e = e
  }

  restart () {
    new Restart(this.e).restart()
  }

  async update () {
    return this.runUpdate(false)
  }

  async forceUpdate () {
    return this.runUpdate(true)
  }

  async runUpdate (force = false) {
    if (!this.e?.isMaster) return false

    const target = this.extractTarget(force)
    if (!target) return this.updateCoreAndModules(force)

    await this.updateModules(target, force)
    return true
  }

  async updateCoreAndModules (force = false) {
    const moduleResult = await this.updateModules('', force, { restart: false })
    const coreResult = await this.updateCore(force)
    const moduleUpdated = moduleResult?.results?.some((item) => item.ok !== false && item.updated)

    if (moduleUpdated && !coreResult?.updated) {
      setTimeout(() => this.restart(), 2000)
    }

    return true
  }

  async updateCore (force = false) {
    const Update = await loadOtherUpdate()
    if (!Update) {
      await this.reply('未找到 plugins/other/update.js，无法更新 WeGame-plugin。')
      return { ok: false, updated: false }
    }

    const originalMsg = this.e.msg
    this.e.msg = `#${force ? '强制' : ''}更新${pluginName}`

    try {
      const updater = new Update()
      updater.e = this.e
      updater.reply = this.reply.bind(this)
      const result = await updater.update()
      return {
        ok: result !== false,
        updated: Boolean(updater.isUp)
      }
    } finally {
      this.e.msg = originalMsg
    }
  }

  async updateModules (target = '', force = false, options = {}) {
    if (moduleUpdating) {
      await this.reply('当前已有模块更新任务进行中，请稍后再试。')
      return null
    }

    const updateAll = !target || isAllModuleTarget(target)
    const moduleCode = updateAll ? '' : target
    const action = force ? '强制更新' : '更新'
    const shouldRestart = options.restart !== false

    moduleUpdating = true

    try {
      await this.reply(updateAll ? `正在${action}全部已安装模块...` : `正在${action}模块：${moduleCode}`)
      const result = await ModuleService.updateInstalledModules(moduleCode, { force })
      await this.reply(this.buildModuleReply(result, moduleCode))

      if (shouldRestart && result.results?.some((item) => item.ok !== false && item.updated)) {
        setTimeout(() => this.restart(), 2000)
      }

      return result
    } catch (error) {
      const message = error?.message || String(error)
      if (isNoInstalledModulesError(message)) {
        await this.reply('当前没有已安装模块可更新。')
        return {
          ok: true,
          total: 0,
          updated: 0,
          failed: 0,
          results: []
        }
      }

      logger.error(`[WeGame-plugin] 模块${action}失败`, error)
      await this.reply(`模块${action}失败：${message}`)
      return {
        ok: false,
        error: message,
        total: 0,
        updated: 0,
        failed: 1,
        results: []
      }
    } finally {
      moduleUpdating = false
    }
  }

  extractTarget (force = false) {
    const command = force ? '强制更新' : '更新'
    const raw = stripCommandPrefix(this.e.msg, command)
    return String(raw || '').trim().split(/\s+/)[0] || ''
  }

  buildModuleReply (payload = {}, moduleCode = '') {
    const results = Array.isArray(payload.results) ? payload.results : []
    const lines = [moduleCode ? `模块更新结果：${moduleCode}` : '模块更新结果']

    if (payload.ok === false) {
      lines.push(payload.error || '模块更新失败')
      lines.push(`可更新全部模块：${formatCommand('更新 模块')}`)
      return lines.join('\n')
    }

    if (results.length === 0) {
      lines.push('当前没有可更新模块。')
      lines.push(`可更新全部模块：${formatCommand('更新 模块')}`)
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

    if (!moduleCode) {
      lines.push(`可指定单模块：${formatCommand('更新 rocom')}`)
    }

    return lines.join('\n')
  }
}
