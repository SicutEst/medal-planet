import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截：自动附带登录令牌
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截
api.interceptors.response.use(
  response => response.data,
  error => {
    const status = error.response?.status
    const url = error.config?.url || ''
    // 登录/注册类接口的 401/429 属于正常业务反馈，不做登出处理
    const isPublicAuthUrl = /^\/family\/(login|create|join|lookup)/.test(url)
    if (status === 401 && !isPublicAuthUrl) {
      // 登录态失效：清理本地状态并回到登录页
      localStorage.removeItem('token')
      localStorage.removeItem('member')
      localStorage.removeItem('family')
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      } else {
        window.location.reload()
      }
    }
    return Promise.reject(error)
  }
)

export default api
