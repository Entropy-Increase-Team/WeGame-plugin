import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './path.js'

const modulesRoot = path.join(pluginRoot, 'modules')
const MODULE_REPOSITORY_URL = 'https://github.com/Entropy-Increase-Team/WeGame-GameModules'
const MODULE_REPOSITORY_DEFAULT_BRANCH = 'main'
const MODULE_REPOSITORY_MAIN_DIR = 'WeGame-GameModules'

function normalizeModuleCode (value = '') {
  return String(value || '').trim().toLowerCase()
}

function readJson (filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    logger.error(`[WeGame-plugin] 读取模块元数据失败：${filePath}`, error)
    return null
  }
}

function normalizeModuleMeta (payload = {}, moduleCode = '') {
  const code = normalizeModuleCode(payload.code || moduleCode)
  if (!code) return null

  return {
    code,
    name: String(payload.name || code).trim(),
    description: String(payload.description || '').trim(),
    version: String(payload.version || '0.0.0').trim(),
    apiDoc: String(payload.apiDoc || '').trim(),
    commands: Array.isArray(payload.commands) ? payload.commands.map((item) => String(item).trim()).filter(Boolean) : [],
    help: payload.help && typeof payload.help === 'object'
      ? {
          icon: String(payload.help.icon || '').trim(),
          title: String(payload.help.title || '').trim(),
          desc: String(payload.help.desc || '').trim()
        }
      : null
  }
}

class ModuleService {
  getRegistryConfig () {
    return {
      moduleRepositoryUrl: MODULE_REPOSITORY_URL,
      defaultBranch: MODULE_REPOSITORY_DEFAULT_BRANCH,
      mainBranchDir: MODULE_REPOSITORY_MAIN_DIR
    }
  }

  hasRemoteRegistry () {
    return true
  }

  getModuleBranch (moduleCode = '') {
    const normalized = normalizeModuleCode(moduleCode)
    if (!normalized) {
      return MODULE_REPOSITORY_DEFAULT_BRANCH
    }
    return normalized
  }

  getInstalledModules () {
    if (!fs.existsSync(modulesRoot)) return []

    const moduleDirs = fs.readdirSync(modulesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())

    return moduleDirs
      .map((entry) => {
        const code = normalizeModuleCode(entry.name)
        const metaPath = path.join(modulesRoot, entry.name, 'module.json')
        if (!fs.existsSync(metaPath)) return null

        const meta = normalizeModuleMeta(readJson(metaPath) || {}, code)
        if (!meta) return null
        return {
          ...meta,
          installed: true,
          enabled: true
        }
      })
      .filter(Boolean)
      .sort((left, right) => left.code.localeCompare(right.code, 'zh-CN'))
  }

  getModuleByCode (moduleCode = '') {
    const normalized = normalizeModuleCode(moduleCode)
    return this.getInstalledModules().find((item) => item.code === normalized) || null
  }

  getEnabledModuleEntries () {
    return this.getInstalledModules()
      .map((item) => ({
        code: item.code,
        appsDir: path.join(modulesRoot, item.code, 'apps')
      }))
  }

  async downloadModule (moduleCode = '') {
    const normalized = normalizeModuleCode(moduleCode)
    if (!normalized) {
      throw new Error('请提供模块名')
    }

    const branch = this.getModuleBranch(normalized)

    throw new Error(`模块下载流程已预留，后续会从 ${MODULE_REPOSITORY_URL} 的 ${branch} 分支拉取模块`)
  }

  getHelpItems () {
    return this.getInstalledModules()
      .map((moduleItem) => {
        const help = moduleItem.help || {}
        const title = help.title || moduleItem.commands.find((item) => /(帮助|help)/i.test(item)) || `${moduleItem.name}帮助`
        const desc = help.desc || `${moduleItem.name}帮助`
        const iconPath = help.icon || `../modules/${moduleItem.code}/resources/img/logo.png`

        return {
          iconPath,
          title,
          desc
        }
      })
      .filter((item) => item.title && item.desc)
  }
}

export default new ModuleService()
