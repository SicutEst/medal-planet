<template>
  <nav class="tab-bar">
    <router-link to="/" class="tab-item" :class="{ active: $route.path === '/' }">
      <span class="icon">🏠</span>
      <span>首页</span>
    </router-link>
    <router-link to="/tasks" class="tab-item" :class="{ active: $route.path === '/tasks' }">
      <span class="icon">📋</span>
      <span>任务</span>
    </router-link>
    <router-link to="/applications" class="tab-item" :class="{ active: $route.path === '/applications' }">
      <span class="icon">📝</span>
      <span>审批</span>
      <span v-if="pendingCount > 0" class="badge">{{ pendingCount }}</span>
    </router-link>
    <router-link to="/store" class="tab-item" :class="{ active: $route.path === '/store' }">
      <span class="icon">🎁</span>
      <span>商店</span>
    </router-link>
    <router-link to="/settings" class="tab-item" :class="{ active: $route.path === '/settings' }">
      <span class="icon">⚙️</span>
      <span>设置</span>
    </router-link>
  </nav>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()
const pendingCount = ref(0)

const loadPendingCount = async () => {
  if (!authStore.isParent) return
  try {
    const res = await api.get(`/application/pending/${authStore.family?.id}`)
    if (res.success) {
      pendingCount.value = res.applications?.length || 0
    }
  } catch (e) {
    console.error('获取待审批数失败', e)
  }
}

onMounted(() => {
  loadPendingCount()
  // 每30秒刷新一次
  setInterval(loadPendingCount, 30000)
})
</script>

<style scoped>
.badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: #FF3B30;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}
.tab-item {
  position: relative;
}
</style>
