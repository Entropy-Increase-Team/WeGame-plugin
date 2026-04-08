import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from '../model/path.js'

const userConfigDir = path.join(pluginRoot, 'config', 'config')
const userConfigPath = path.join(userConfigDir, 'wgconfig.yaml')
const defaultConfigPath = path.join(pluginRoot, 'config', 'wgconfig_default.yaml')
const gamesConfigDir = path.join(userConfigDir, 'games')

if (!fs.existsSync(userConfigDir)) {
  fs.mkdirSync(userConfigDir, { recursive: true })
}

if (!fs.existsSync(gamesConfigDir)) {
  fs.mkdirSync(gamesConfigDir, { recursive: true })
}

if (!fs.existsSync(userConfigPath)) {
  try {
    if (fs.existsSync(defaultConfigPath)) {
      fs.copyFileSync(defaultConfigPath, userConfigPath)
    }

    if (fs.existsSync(userConfigPath)) {
      logger.info('[WeGame-plugin] 已自动创建 wgconfig.yaml')
    }
  } catch (error) {
    logger.error('[WeGame-plugin] 自动创建 wgconfig.yaml 失败', error)
  }
}

class Config {
  constructor () {
    this.cache = {
      config: null,
      defaultConfig: null,
      games: {}
    }

    this.fileMaps = {
      config: userConfigPath,
      defaultConfig: defaultConfigPath
    }
    this.watchedGameFiles = new Set()

    this.watchFiles()
  }

  loadYaml (filePath) {
    try {
      if (!fs.existsSync(filePath)) return {}
      return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}
    } catch (error) {
      logger.error(`[WeGame-plugin] 读取配置失败：${path.basename(filePath)}`, error)
      return {}
    }
  }

  watchFiles () {
    Object.entries(this.fileMaps).forEach(([key, filePath]) => {
      if (!fs.existsSync(filePath)) return
      fs.watchFile(filePath, { interval: 1000 }, () => {
        this.cache[key] = null
      })
    })
  }

  getConfig () {
    if (this.cache.config === null) {
      this.cache.config = this.loadYaml(this.fileMaps.config)
    }
    return this.cache.config
  }

  getDefaultConfig () {
    if (this.cache.defaultConfig === null) {
      this.cache.defaultConfig = this.loadYaml(this.fileMaps.defaultConfig)
    }
    return this.cache.defaultConfig
  }

  get (group, key) {
    const config = this.getConfig()
    if (config?.[group]?.[key] !== undefined) {
      return config[group][key]
    }

    const defaultConfig = this.getDefaultConfig()
    return defaultConfig?.[group]?.[key]
  }

  setConfig (data) {
    try {
      fs.writeFileSync(this.fileMaps.config, YAML.stringify(data), 'utf8')
      this.cache.config = data
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 写入配置失败', error)
      return false
    }
  }

  getGameConfigPath (gameCode = '') {
    const normalized = String(gameCode || '').trim().toLowerCase()
    if (!normalized) {
      throw new Error('缺少游戏模块标识')
    }

    return path.join(gamesConfigDir, `${normalized}.yaml`)
  }

  watchGameConfig (gameCode = '') {
    const normalized = String(gameCode || '').trim().toLowerCase()
    if (!normalized) return

    const filePath = this.getGameConfigPath(normalized)
    if (!fs.existsSync(filePath) || this.watchedGameFiles.has(filePath)) {
      return
    }

    fs.watchFile(filePath, { interval: 1000 }, () => {
      this.cache.games[normalized] = undefined
    })
    this.watchedGameFiles.add(filePath)
  }

  getGameConfig (gameCode = '') {
    const normalized = String(gameCode || '').trim().toLowerCase()
    if (!normalized) return {}

    if (this.cache.games[normalized] === undefined) {
      this.watchGameConfig(normalized)
      this.cache.games[normalized] = this.loadYaml(this.getGameConfigPath(normalized))
    }

    return this.cache.games[normalized] || {}
  }

  setGameConfig (gameCode = '', data = {}) {
    const normalized = String(gameCode || '').trim().toLowerCase()
    if (!normalized) {
      throw new Error('缺少游戏模块标识')
    }

    try {
      fs.writeFileSync(this.getGameConfigPath(normalized), YAML.stringify(data), 'utf8')
      this.watchGameConfig(normalized)
      this.cache.games[normalized] = data
      return true
    } catch (error) {
      logger.error(`[WeGame-plugin] 写入游戏配置失败：${normalized}`, error)
      return false
    }
  }
}

export default new Config()
