// 主题注册中心：所有皮肤的定义、应用与按成员持久化
// 皮肤 = CSS 变量包（main.css 中 [data-theme='xx'] 覆盖）+ 货币图标映射
import { ref } from 'vue'

export const THEMES = [
  {
    id: 'cream',
    name: '奶油星球',
    desc: '薄荷青 · 温柔百搭',
    colors: ['#2FB8AC', '#FFD166', '#FAF6EE'],
    cur: ['🎟️', '🔮']
  },
  {
    id: 'minecraft',
    name: '像素方块',
    desc: '草地绿 · 方块与硬阴影',
    colors: ['#5B8731', '#8B5A2B', '#EFEAC8'],
    cur: ['💎', '⭐']
  },
  {
    id: 'duo',
    name: '活力闯关',
    desc: '羽毛绿 · 立体大按钮',
    colors: ['#58CC02', '#1CB0F6', '#F4FBF4'],
    cur: ['⚡', '💎']
  },
  {
    id: 'eggy',
    name: '圆滚滚',
    desc: '泡泡糖粉 · 圆角与弹跳',
    colors: ['#FF7EB0', '#FFE066', '#FFF7F0'],
    cur: ['🍬', '🥚']
  },
  {
    id: 'mario',
    name: '冒险红蓝',
    desc: '经典红 · 星星与金币',
    colors: ['#E52521', '#FBD000', '#FFF8E7'],
    cur: ['⭐', '🪙']
  },
  {
    id: 'sonic',
    name: '电光蓝环',
    desc: '电光蓝 · 速度线条',
    colors: ['#0F6FFF', '#FFD100', '#F0F6FF'],
    cur: ['💫', '💍']
  },
  {
    id: 'space',
    name: '星空夜航',
    desc: '深空蓝 · 星星点点（夜间）',
    colors: ['#6C8CFF', '#FFD166', '#1A2140'],
    cur: ['⭐', '🪐'],
    dark: true
  },
  {
    id: 'garden',
    name: '花园物语',
    desc: '草木绿 · 花瓣与果实',
    colors: ['#5CA052', '#D97742', '#F5F7EE'],
    cur: ['🌸', '🍎']
  },
  {
    id: 'macaron',
    name: '甜心马卡龙',
    desc: '藕粉紫 · 闪闪少女心',
    colors: ['#F49FB6', '#B28DD9', '#FEF5F7'],
    cur: ['💗', '✨']
  }
]

export const currentTheme = ref('cream')

export function applyTheme(id, memberId) {
  const theme = THEMES.find(t => t.id === id)
  if (!theme) return
  currentTheme.value = id
  // cream 是默认变量，无需 data-theme
  if (id === 'cream') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = id
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme.colors[0])
  if (memberId) {
    localStorage.setItem(`theme_${memberId}`, id)
  }
}

export function loadThemeFor(memberId) {
  if (!memberId) return
  const saved = localStorage.getItem(`theme_${memberId}`)
  if (saved && THEMES.some(t => t.id === saved)) {
    applyTheme(saved)
  }
}

// 当前主题的货币图标 [贴纸, 粉球]
export function themeCurrencies() {
  const t = THEMES.find(t => t.id === currentTheme.value)
  return t ? t.cur : ['🎟️', '🔮']
}
