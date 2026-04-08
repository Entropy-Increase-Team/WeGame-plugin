const COMMAND_PREFIXES = ['=']
const DEFAULT_COMMAND_PREFIX = '='

function escapeRegExp (value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const COMMAND_PREFIX_PATTERN = `(?:${COMMAND_PREFIXES.map((item) => escapeRegExp(item)).join('|')})`

function buildCommandReg (bodyPattern = '') {
  return `^${COMMAND_PREFIX_PATTERN}\\s*${bodyPattern}$`
}

function stripCommandPrefix (message = '', commandLiteral = '') {
  const pattern = new RegExp(`^${COMMAND_PREFIX_PATTERN}\\s*${escapeRegExp(commandLiteral)}`)
  return String(message || '').replace(pattern, '').trim()
}

function formatCommand (command = '') {
  return `${DEFAULT_COMMAND_PREFIX}${String(command || '').trim()}`
}

export {
  buildCommandReg,
  COMMAND_PREFIXES,
  DEFAULT_COMMAND_PREFIX,
  formatCommand,
  stripCommandPrefix
}
