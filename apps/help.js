import { buildCommandReg, COMMAND_PREFIXES, formatCommand } from '../utils/command.js'
import { getHelpConfig } from '../utils/helpConfig.js'
import ModuleService from '../model/moduleService.js'

function applyPlaceholders (value = '') {
  return String(value || '')
    .replaceAll('{default_prefix}', formatCommand(''))
    .replaceAll('{prefixes}', COMMAND_PREFIXES.join(' / '))
}

function normalizeHelpGroups (groups = []) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    if (group?.type === 'tips' && Array.isArray(group.items)) {
      return {
        ...group,
        items: group.items.map((item) => ({
          title: applyPlaceholders(item?.title || ''),
          text: applyPlaceholders(item?.text || '')
        }))
      }
    }

    return {
      ...group,
      group: applyPlaceholders(group?.group || ''),
      list: (Array.isArray(group?.list) ? group.list : []).map((item) => ({
        title: applyPlaceholders(item?.title || ''),
        desc: applyPlaceholders(item?.desc || '')
      }))
    }
  })
}

function buildModuleEntryGroups (groupTitle = '游戏模块') {
  const normalizedGroupTitle = applyPlaceholders(groupTitle).trim() || '游戏模块'
  const moduleItems = ModuleService.getHelpItems()
    .map((item) => ({
      title: applyPlaceholders(item?.title || ''),
      desc: applyPlaceholders(item?.desc || '')
    }))
    .filter((item) => item.title || item.desc)

  if (moduleItems.length === 0) {
    return []
  }

  return [
    {
      group: normalizedGroupTitle,
      list: moduleItems
    }
  ]
}

function buildFallbackText (helpCfg = {}, helpGroup = []) {
  const lines = []

  if (helpCfg?.title) {
    lines.push(helpCfg.title)
  }

  if (helpCfg?.subTitle) {
    lines.push(helpCfg.subTitle)
  }

  for (const group of helpGroup) {
    if (group?.type === 'tips' && Array.isArray(group.items) && group.items.length) {
      lines.push('')
      for (const item of group.items) {
        if (!item?.title && !item?.text) continue
        lines.push(item?.text ? `${item.title}：${item.text}` : item.title)
      }
      continue
    }

    const list = Array.isArray(group?.list) ? group.list : []
    if (!group?.group && list.length === 0) continue

    lines.push('')
    if (group?.group) {
      lines.push(`${group.group}：`)
    }

    for (const item of list) {
      if (!item?.title && !item?.desc) continue
      lines.push(item?.desc ? `${item.title} - ${item.desc}` : item.title)
    }
  }

  return lines.join('\n')
}

function buildInstalledModuleHint () {
  const moduleItems = ModuleService.getHelpItems()
  const lines = [
    '已安装游戏组件，请使用对应组件帮助：'
  ]

  for (const item of moduleItems) {
    const title = applyPlaceholders(item?.title || '')
    const desc = applyPlaceholders(item?.desc || '')
    lines.push(desc ? `${title} - ${desc}` : title)
  }

  return lines.filter(Boolean).join('\n')
}

export class WeGameHelp extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin] 帮助',
      dsc: 'WeGame 插件帮助',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: buildCommandReg('(?:帮助|help|菜单)'),
          fnc: 'showHelp'
        }
      ]
    })

    this.e = e
  }

  async showHelp () {
    if (ModuleService.getInstalledModules().length > 0) {
      await this.reply(buildInstalledModuleHint())
      return true
    }

    const helpSetting = getHelpConfig()
    const helpCfg = {
      title: applyPlaceholders(helpSetting?.help_title || 'WeGame 帮助'),
      subTitle: applyPlaceholders(helpSetting?.help_sub_title || `支持前缀：${COMMAND_PREFIXES.join(' / ')}`)
    }
    const helpGroup = [
      ...normalizeHelpGroups(helpSetting?.help_group),
      ...buildModuleEntryGroups(helpSetting?.module_group_title || '游戏模块')
    ]
    const layout = {
      colCount: Math.max(1, Number(helpSetting?.help_layout?.col_count) || 3),
      colWidth: Math.max(120, Number(helpSetting?.help_layout?.col_width) || 340),
      widthGap: Math.max(0, Number(helpSetting?.help_layout?.width_gap) || 18)
    }
    const gridWidth = layout.colCount * layout.colWidth + Math.max(0, layout.colCount - 1) * layout.widthGap
    const contentWidth = gridWidth + 120

    try {
      if (!this.e.runtime?.render) {
        throw new Error('当前环境不支持图片渲染')
      }

      const image = await this.e.runtime.render(
        'WeGame-plugin',
        'help/help',
        {
          helpCfg,
          helpGroup,
          copyright: 'WeGame-plugin',
          contentWidth,
          colCount: layout.colCount,
          colWidth: layout.colWidth,
          widthGap: layout.widthGap
        },
        {
          retType: 'base64',
          scale: 1.6
        }
      )

      if (!image) {
        throw new Error('帮助菜单渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin] 帮助渲染失败', error)
      const fallback = buildFallbackText(helpCfg, helpGroup)
      await this.reply(fallback)
      return true
    }
  }
}
