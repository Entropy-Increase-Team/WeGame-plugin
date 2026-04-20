import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { pluginName, pluginRoot } from './path.js'

let _patched = false
async function patchPuppeteer () {
  if (_patched) return
  _patched = true
  const origInit = puppeteer.browserInit.bind(puppeteer)
  puppeteer.browserInit = async function () {
    const browser = await origInit()
    if (browser && !browser._dsfPatched) {
      browser._dsfPatched = true
      const OrigNewPage = browser.newPage.bind(browser)
      browser.newPage = async function () {
        const page = await OrigNewPage()
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 })
        return page
      }
    }
    return browser
  }
}

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
      scale: 2.5
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

  await patchPuppeteer()
  const image = await puppeteer.screenshot(`${pluginName}/${htmlPath}`, {
    ...renderData,
    quality: 100,
    zoom:2,
    type: 'png'
  })

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
