import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { pluginName, pluginRoot } from './path.js'

function normalizeRenderPath (value = '') {
  return String(value || '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean)
    .join('/')
}

function buildRelativeRootPath (depth = 0) {
  return `../../../${'../'.repeat(Math.max(0, Number(depth) || 0))}`
}

async function renderModuleTemplate (e, moduleCode, renderPath, data = {}, cfg = {}) {
  const normalizedModuleCode = String(moduleCode || '').trim().toLowerCase()
  const normalizedRenderPath = normalizeRenderPath(renderPath)

  if (!normalizedModuleCode) {
    throw new Error('缺少模块标识')
  }

  if (!normalizedRenderPath) {
    throw new Error('缺少模板路径')
  }

  const htmlPath = normalizeRenderPath(`modules/${normalizedModuleCode}/${normalizedRenderPath}`)
  const pathParts = htmlPath.split('/').filter(Boolean)

  await Bot.mkdir(`temp/html/${pluginName}/${htmlPath}`)

  const relativeRootPath = buildRelativeRootPath(pathParts.length)
  const moduleResPath = `${relativeRootPath}plugins/${pluginName}/modules/${normalizedModuleCode}/resources/`
  const pluginResPath = `${relativeRootPath}plugins/${pluginName}/resources/`

  let renderData = {
    sys: {
      scale: 1
    },
    _res_path: moduleResPath,
    _plugin_res_path: pluginResPath,
    _module_res_path: moduleResPath,
    pluResPath: moduleResPath,
    pluginResPath,
    moduleResPath,
    ...data,
    _plugin: pluginName,
    _htmlPath: htmlPath,
    tplFile: path.join(pluginRoot, 'modules', normalizedModuleCode, 'resources', `${normalizedRenderPath}.html`),
    saveId: data.saveId || data.save_id || pathParts[pathParts.length - 1]
  }

  if (cfg.beforeRender) {
    renderData = cfg.beforeRender({ data: renderData }) || renderData
  }

  const image = await puppeteer.screenshot(`${pluginName}/${htmlPath}`, renderData)

  if (cfg.retType === 'base64') {
    return image
  }

  let ret = true
  if (image) {
    ret = cfg.recallMsg
      ? await e.reply(image, false, {})
      : await e.reply(image)
  }

  return cfg.retType === 'msgId' ? ret : true
}

export {
  renderModuleTemplate
}
