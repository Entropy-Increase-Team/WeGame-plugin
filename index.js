import fs from 'node:fs'
import path from 'node:path'
import Config from './utils/config.js'
import ModuleService from './model/moduleService.js'
import { pluginRoot } from './model/path.js'

if (!global.segment) {
  global.segment = (await import('oicq')).segment
}

if (!global.core) {
  try {
    global.core = (await import('oicq')).core
  } catch (err) {}
}

function getCoreAppEntries () {
  const appsDir = path.join(pluginRoot, 'apps')
  return fs
    .readdirSync(appsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({
      key: file.replace('.js', ''),
      file,
      importPath: `./apps/${file}`
    }))
}

function getModuleAppEntries () {
  return ModuleService
    .getEnabledModuleEntries()
    .flatMap((moduleEntry) => {
      if (!fs.existsSync(moduleEntry.appsDir)) return []
      return fs.readdirSync(moduleEntry.appsDir)
        .filter((file) => file.endsWith('.js'))
        .map((file) => ({
          key: `${moduleEntry.code}_${file.replace('.js', '')}`,
          file,
          importPath: `./modules/${moduleEntry.code}/apps/${file}`
        }))
    })
}

const appEntries = [
  ...getCoreAppEntries(),
  ...getModuleAppEntries()
]

let ret = []

logger.info('-------------------')
logger.info('WeGame-plugin 载入成功!')
logger.info(`[WeGame-plugin] 当前后端：${Config.get('wegame', 'base_url')}`)
logger.info('-------------------')

appEntries.forEach((entry) => {
  ret.push(import(entry.importPath))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in appEntries) {
  const name = appEntries[i].key
  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }
