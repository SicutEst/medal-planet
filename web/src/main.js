import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/main.css'
import { loadThemeFor } from './utils/theme'

const app = createApp(App)
app.use(createPinia())
app.use(router)
try {
  const m = JSON.parse(localStorage.getItem('member') || 'null')
  if (m?.id) loadThemeFor(m.id)
} catch {}

app.mount('#app')
