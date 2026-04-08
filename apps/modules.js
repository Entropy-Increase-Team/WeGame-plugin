import ModuleService from '../model/moduleService.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'

function buildModuleName (moduleItem = {}) {
  return moduleItem.name || moduleItem.code || '未命名模块'
}

export class WeGameModules extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin] 模块管理',
      dsc: 'WeGame 模块列表与下载',
      event: 'message',
      priority: 90,
      rule: [
        {
          reg: buildCommandReg('模块下载(?:\\s+.*)?'),
          fnc: 'downloadModule'
        },
        {
          reg: buildCommandReg('模块\\s*'),
          fnc: 'listModules'
        }
      ]
    })

    this.e = e
  }

  async listModules () {
    try {
      const catalog = await ModuleService.getModuleCatalog()
      await this.reply(this.buildCatalogText(catalog))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 查询模块列表失败', error)
      await this.reply(`查询模块列表失败：${error.message || error}`)
      return true
    }
  }

  async downloadModule () {
    const raw = stripCommandPrefix(this.e.msg, '模块下载')
    if (!raw) {
      return this.listModules()
    }

    const moduleCode = String(raw || '').trim().split(/\s+/)[0]

    try {
      const installed = ModuleService.getModuleByCode(moduleCode)
      if (installed) {
        await this.reply(`模块「${moduleCode}」已经安装，无需重复下载。`)
        return true
      }

      await this.reply(`正在下载模块：${moduleCode}`)
      const result = await ModuleService.downloadModule(moduleCode)

      if (result.status === 'already_installed') {
        await this.reply(`模块「${moduleCode}」已经安装，无需重复下载。`)
        return true
      }

      await this.reply([
        `模块下载成功：${moduleCode}`,
        `目录：plugins/WeGame-plugin/modules/${moduleCode}`,
        '请重启 Yunzai 或重载插件后使用该模块命令。'
      ].join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 下载模块失败', error)
      await this.reply(`下载模块失败：${error.message || error}`)
      return true
    }
  }

  buildCatalogText (catalog = {}) {
    const registry = catalog.registry || {}
    const installed = Array.isArray(catalog.installed) ? catalog.installed : []
    const remote = Array.isArray(catalog.remote) ? catalog.remote : []

    const lines = [
      'WeGame 模块列表',
      `仓库：${registry.moduleRepositoryUrl || '未配置'}`,
      `默认分支：${registry.defaultBranch || 'main'}`,
      ''
    ]

    lines.push('已安装模块：')
    if (installed.length === 0) {
      lines.push('暂无')
    } else {
      for (const moduleItem of installed) {
        lines.push(`- ${moduleItem.code} | ${buildModuleName(moduleItem)}`)
      }
    }

    lines.push('')
    lines.push(`远程可下载模块（已排除 ${registry.defaultBranch || 'main'} 分支）：`)
    if (remote.length === 0) {
      lines.push('暂无')
      lines.push(`当前 GitHub 仓库暂时只有 ${registry.defaultBranch || 'main'} 分支。`)
    } else {
      for (const moduleItem of remote) {
        const suffix = moduleItem.installed ? ' | 已安装' : ''
        lines.push(`- ${moduleItem.code}${suffix}`)
      }
    }

    lines.push('')
    lines.push(`下载命令：${formatCommand('模块下载 <模块名>')}`)

    return lines.join('\n')
  }
}
