import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from '../model/path.js'

const userHelpPath = path.join(pluginRoot, 'config', 'config', 'help.yaml')
const defaultHelpPath = path.join(pluginRoot, 'config', 'help_default.yaml')
const gamesConfigDir = path.join(pluginRoot, 'config', 'config', 'games')

function deepMerge (base, override) {
  if (override == null || typeof override !== 'object') return base ?? override
  if (Array.isArray(override)) return override

  const result = {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {})
  }

  for (const key of Object.keys(override)) {
    const value = override[key]
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

function loadYaml (filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}
  } catch (error) {
    logger.error(`[WeGame-plugin] 读取帮助配置失败：${path.basename(filePath)}`, error)
    return {}
  }
}

function getHelpConfig () {
  const defaults = loadYaml(defaultHelpPath)
  const userConfig = loadYaml(userHelpPath)
  return deepMerge(defaults, userConfig)
}

function extractHelpGroups (payload = {}) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.help_group)) return payload.help_group
  return []
}

function getModuleHelpDefaultPath (moduleCode = '') {
  const normalized = String(moduleCode || '').trim().toLowerCase()
  if (!normalized) return ''
  return path.join(pluginRoot, 'modules', normalized, 'defSet', `${normalized}_help_default.yaml`)
}

function getModuleHelpUserPath (moduleCode = '') {
  const normalized = String(moduleCode || '').trim().toLowerCase()
  if (!normalized) return ''
  return path.join(gamesConfigDir, `${normalized}_help.yaml`)
}

function getModuleHelpGroups (moduleCode = '') {
  const defaultPath = getModuleHelpDefaultPath(moduleCode)
  const userPath = getModuleHelpUserPath(moduleCode)
  const defaults = loadYaml(defaultPath)
  const userConfig = loadYaml(userPath)

  const userGroups = extractHelpGroups(userConfig)
  if (userGroups.length) {
    return userGroups
  }

  const defaultGroups = extractHelpGroups(defaults)
  if (defaultGroups.length) {
    return defaultGroups
  }

  const merged = deepMerge(defaults, userConfig)
  return extractHelpGroups(merged)
}

export {
  getHelpConfig,
  getModuleHelpGroups
}
