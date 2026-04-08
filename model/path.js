import path from 'node:path'
import { fileURLToPath } from 'node:url'

const _path = process.cwd().replace(/\\/g, '/')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginName = path.basename(path.dirname(__dirname))
const pluginRoot = path.join(_path, 'plugins', pluginName)

export { _path, pluginName, pluginRoot }
