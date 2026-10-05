<template>
  <div class="page">
    <div class="header">
      <h1>📝 审批中心</h1>
    </div>

    <!-- 家长可见：待审批列表 -->
    <div v-if="authStore.isParent">
      <h3 style="margin-bottom: 16px">⏳ 待审批</h3>
      
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
      </div>

      <div v-else-if="pendingApps.length === 0" class="card empty-state">
        <div class="icon">🎉</div>
        <p>太棒了！暂无待审批申请</p>
      </div>

      <div v-else>
        <div v-for="app in pendingApps" :key="app.id" class="application-card">
          <div class="app-header">
            <div class="applicant-info">
              <span class="avatar">{{ getAvatar(app.applicant_role, app.applicant_name, app.applicant_avatar) }}</span>
              <span class="name">{{ app.applicant_name }}</span>
            </div>
            <span class="amount" :class="app.application_type">
              {{ app.application_type === 'penalty' ? '-' : '+' }}{{ app.requested_stickers }}
            </span>
          </div>
          
          <div class="reason">
            <span v-if="app.task_name">📋 {{ app.task_name }}</span>
            <span v-else>💬 {{ app.reason || '自定义申请' }}</span>
          </div>

          <div class="app-time">
            {{ formatTime(app.created_at) }}
          </div>

          <div class="actions">
            <button class="btn btn-success btn-sm" @click="review(app.id, true)" :disabled="processing">
              ✅ 通过
            </button>
            <button class="btn btn-warning btn-sm" @click="review(app.id, false)" :disabled="processing">
              ❌ 拒绝
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 孩子视角：查看历史 -->
    <div v-else>
      <h3 style="margin-bottom: 16px">📜 申请记录</h3>
      
      <div v-if="historyApps.length === 0" class="card empty-state">
        <div class="icon">📝</div>
        <p>暂无申请记录</p>
      </div>

      <div v-else>
        <div v-for="app in historyApps" :key="app.id" class="history-card">
          <div class="history-header">
            <span class="type-badge" :class="app.application_type">
              {{ app.application_type === 'penalty' ? '扣减' : '获得' }}
            </span>
            <span class="status-badge" :class="app.status">
              {{ app.status === 'pending' ? '待审批' : app.status === 'approved' ? '已通过' : '已拒绝' }}
            </span>
          </div>
          <div class="history-content">
            <span class="amount" :class="app.application_type">
              {{ app.application_type === 'penalty' ? '-' : '+' }}{{ app.requested_stickers }} 🎟️
            </span>
            <span class="task-name" v-if="app.task_name">→ {{ app.task_name }}</span>
          </div>
          <div class="history-time">
            {{ formatTime(app.created_at) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()
const pendingApps = ref([])
const historyApps = ref([])
const loading = ref(false)
const processing = ref(false)

const formatTime = (time) => {
  if (!time) return ''
  const d = new Date(time)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const loadPending = async () => {
  if (!authStore.family?.id) return
  loading.value = true
  try {
    const res = await api.get(`/application/pending/${authStore.family.id}`)
    if (res.success) {
      pendingApps.value = res.applications || []
    }
  } catch (e) {
    console.error('获取待审批失败', e)
  } finally {
    loading.value = false
  }
}

const getAvatar = (role, name, avatar) => {
  if (avatar) return avatar
  if (role === 'parent') {
    if (name?.includes('妈') || name?.includes('母')) return '👩'
    return '👨'
  }
  if (name?.includes('妹') || name?.includes('姐') || name?.includes('女')) return '👧'
  return '👦'
}

const loadHistory = async () => {
  if (!authStore.member?.id) return
  loading.value = true
  try {
    const res = await api.get(`/application/history/${authStore.member.id}`)
    if (res.success) {
      historyApps.value = res.applications || []
    }
  } catch (e) {
    console.error('获取历史失败', e)
  } finally {
    loading.value = false
  }
}

const review = async (appId, approved) => {
  processing.value = true
  try {
    const res = await api.put(`/application/${appId}/review`, {
      reviewerId: authStore.member.id,
      approved
    })
    if (res.success) {
      await loadPending()
      await authStore.refreshMember()
    }
  } catch (e) {
    console.error('审批失败', e)
  } finally {
    processing.value = false
  }
}

onMounted(() => {
  if (authStore.isParent) {
    loadPending()
  } else {
    loadHistory()
  }
})
</script>

<style scoped>
.application-card {
  background: white;
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  border-left: 4px solid var(--primary);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.applicant-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  font-size: 24px;
}

.name {
  font-weight: 600;
}

.amount {
  font-size: 24px;
  font-weight: 700;
}

.amount.earn {
  color: var(--accent);
}

.amount.penalty {
  color: #FF6B6B;
}

.reason {
  color: var(--text-light);
  margin-bottom: 8px;
}

.app-time {
  font-size: 12px;
  color: var(--text-light);
  margin-bottom: 12px;
}

.actions {
  display: flex;
  gap: 12px;
}

/* 历史卡片 */
.history-card {
  background: white;
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
}

.history-header {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.type-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.type-badge.earn {
  background: #E8F5E9;
  color: #4CAF50;
}

.type-badge.penalty {
  background: #FFEBEE;
  color: #F44336;
}

.status-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background: #FFF3E0;
  color: #FF9800;
}

.status-badge.approved {
  background: #E8F5E9;
  color: #4CAF50;
}

.status-badge.rejected {
  background: #FFEBEE;
  color: #F44336;
}

.history-content {
  margin-bottom: 4px;
}

.task-name {
  color: var(--text-light);
  font-size: 14px;
}

.history-time {
  font-size: 12px;
  color: var(--text-light);
}
</style>
