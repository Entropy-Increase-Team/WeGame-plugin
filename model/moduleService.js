import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import axios from 'axios'
import { pluginRoot } from './path.js'

const modulesRoot = path.join(pluginRoot, 'modules')
const MODULE_REPOSITORY_URL = 'https://github.com/Entropy-Increase-Team/WeGame-GameModules'
const MODULE_REPOSITORY_DEFAULT_BRANCH = 'main'
const MODULE_REPOSITORY_MAIN_DIR = 'WeGame-GameModules'
const MODULE_REPOSITORY_GIT_URL = `${MODULE_REPOSITORY_URL}.git`
const MODULE_BRANCH_API_URL = 'https://api.github.com/repos/Entropy-Increase-Team/WeGame-GameModules/branches'
const execFileAsync = promisify(execFile)

function normalizeModuleCode (value = '') {
  return String(value || '').trim().toLowerCase()
}

function isValidModuleCode (value = '') {
  return /^[a-z0-9][a-z0-9_-]*$/.test(String(value || '').trim())
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
      gitRepositoryUrl: MODULE_REPOSITORY_GIT_URL,
      branchApiUrl: MODULE_BRANCH_API_URL,
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

  async fetchRemoteBranches () {
    let response

    try {
      response = await axios.get(MODULE_BRANCH_API_URL, {
        timeout: 15000,
        params: {
          per_page: 100
        },
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WeGame-plugin'
        },
        validateStatus: () => true
      })
    } catch (error) {
      throw new Error(`查询 GitHub 模块分支失败：${error.message || error}`)
    }

    if (response.status >= 400) {
      const message = response.data?.message || `HTTP ${response.status}`
      throw new Error(`查询 GitHub 模块分支失败：${message}`)
    }

    const rows = Array.isArray(response.data) ? response.data : []
    return rows
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean)
  }

  async getRemoteModules () {
    const installedSet = new Set(this.getInstalledModules().map((item) => item.code))
    const branches = await this.fetchRemoteBranches()

    return [...new Set(branches
      .map((item) => normalizeModuleCode(item))
      .filter((item) => item && item !== MODULE_REPOSITORY_DEFAULT_BRANCH)
      .filter((item) => isValidModuleCode(item))
    )]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map((code) => ({
        code,
        branch: this.getModuleBranch(code),
        installed: installedSet.has(code)
      }))
  }

  async getModuleCatalog () {
    return {
      registry: this.getRegistryConfig(),
      installed: this.getInstalledModules(),
      remote: await this.getRemoteModules()
    }
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

    if (!isValidModuleCode(normalized)) {
      throw new Error('模块名格式不正确，仅支持英文、数字、-、_')
    }

    if (normalized === MODULE_REPOSITORY_DEFAULT_BRANCH) {
      throw new Error(`默认分支 ${MODULE_REPOSITORY_DEFAULT_BRANCH} 不是游戏模块分支`)
    }

    const branch = this.getModuleBranch(normalized)
    const targetDir = path.join(modulesRoot, normalized)
    const metaPath = path.join(targetDir, 'module.json')

    if (fs.existsSync(metaPath)) {
      return {
        status: 'already_installed',
        branch,
        targetDir,
        module: this.getModuleByCode(normalized)
      }
    }

    const remoteModules = await this.getRemoteModules()
    const existsRemote = remoteModules.some((item) => item.code === normalized)
    if (!existsRemote) {
      throw new Error(`未找到模块「${normalized}」，请先发送 =模块 查看可下载模块列表`)
    }

    if (fs.existsSync(targetDir)) {
      const entries = fs.readdirSync(targetDir)
      if (entries.length > 0) {
        throw new Error(`目录已存在且非空：modules/${normalized}，请先手动处理后再下载`)
      }
    } else {
      fs.mkdirSync(modulesRoot, { recursive: true })
    }

    try {
      await execFileAsync('git', [
        'clone',
        '-b',
        branch,
        '--single-branch',
        MODULE_REPOSITORY_GIT_URL,
        targetDir
      ], {
        cwd: pluginRoot
      })
    } catch (error) {
      const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || String(error)
      throw new Error(`模块下载失败：${message}`)
    }

    if (!fs.existsSync(metaPath)) {
      throw new Error(`模块下载完成，但目录中未找到 module.json：modules/${normalized}`)
    }

    return {
      status: 'downloaded',
      branch,
      targetDir,
      module: this.getModuleByCode(normalized)
    }
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
