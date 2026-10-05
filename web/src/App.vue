<template>
  <div id="app">
    <!-- 未登录 -->
    <LoginPage v-if="!authStore.isLoggedIn" @login="handleLogin" />
    
    <!-- 已登录 -->
    <template v-else>
      <div class="app-container">
        <router-view />
        <TabBar />
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import LoginPage from './views/LoginPage.vue'
import TabBar from './components/TabBar.vue'

const authStore = useAuthStore()

const handleLogin = () => {
  // 登录成功，页面会自动刷新
}

onMounted(() => {
  authStore.checkLogin()
})
</script>

<style>
.app-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--bg);
}
</style>
