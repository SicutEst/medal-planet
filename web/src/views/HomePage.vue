<template>
  <div class="page">
    <!-- 头部 -->
    <div class="header">
      <div>
        <h1>🏅 奖章星球</h1>
        <p style="font-size: 14px; opacity: 0.9;">{{ family?.name || '' }} · {{ authStore.member?.name }}</p>
      </div>
      <div class="role-badge" :class="authStore.isParent ? 'parent' : 'child'">
        {{ authStore.member?.avatar || (authStore.isParent ? '👨‍👩‍👧' : '👦') }}
      </div>
    </div>

    <!-- 余额卡片 -->
    <div class="balance-card">
      <div class="balance-item">
        <div class="icon">🎟️</div>
        <div class="value">{{ authStore.member?.current_stickers || 0 }}</div>
        <div class="label">贴纸</div>
      </div>
      <div class="balance-divider"></div>
      <div class="balance-item">
        <div class="icon">🔮</div>
        <div class="value">{{ authStore.member?.current_balls || 0 }}</div>
        <div class="label">粉球</div>
        <div class="progress-tip">
          再攒 {{ 160 - (authStore.member?.current_stickers || 0) % 160 }} 个可兑换1粉球
        </div>
      </div>
    </div>

    <!-- 今日任务 -->
    <div class="card">
      <div class="section-header">
        <h2>📋 今日任务</h2>
        <span class="date">{{ todayStr }}</span>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
      </div>

      <div v-else-if="todayTasks.length === 0" class="empty-state">
        <div class="icon">📝</div>
        <p>今天没有任务</p>
      </div>

      <div v-else>
        <div
          v-for="task in todayTasks"
          :key="task.id"
          class="task-item"
          :class="{
            completed: task.is_completed_today > 0,
            'bad-habit': task.category === 'bad_habit',
            'todo-task': task.category === 'temporary'
          }"
        >
          <div class="checkbox" :class="{
            checked: task.is_completed_today > 0,
            'bad-habit-check': task.category === 'bad_habit',
            'todo-check': task.category === 'temporary'
          }" @click="toggleTask(task)">
            <span v-if="task.is_completed_today > 0">{{ task.category === 'bad_habit' ? '✗' : '✓' }}</span>
          </div>
          <div class="task-name">
            {{ task.name }}
            <span v-if="task.category === 'bad_habit'" class="tag tag-warn">坏习惯</span>
            <span v-else-if="task.category === 'temporary'" class="tag tag-todo">待办</span>
          </div>
          <div class="reward" :class="{ penalty: task.category === 'bad_habit' }">
            {{ task.category === 'bad_habit' ? '-' : '+' }}{{ task.sticker_reward }} 🎟️
          </div>
        </div>

        <button
          v-if="hasCompletedTask && !submittedToday"
          class="btn btn-primary"
          style="width: 100%; margin-top: 16px"
          @click="submitDailyTasks"
          :disabled="submitting"
        >
          {{ submitting ? '提交中...' : '📤 提交今日任务' }}
        </button>

        <div v-if="submittedToday" class="submit-success">
          ✅ 已提交，等待家长审批
        </div>
      </div>
    </div>

    <!-- 待审批提醒（家长可见） -->
    <div v-if="authStore.isParent" class="card pending-card">
      <div class="section-header">
        <h2>📝 待审批</h2>
        <router-link to="/applications" class="view-more">查看全部 →</router-link>
      </div>
      <div v-if="pendingApps.length === 0" class="empty-state" style="padding: 20px">
        <p>暂无待审批申请</p>
      </div>
      <div v-else>
        <div v-for="app in pendingApps.slice(0, 3)" :key="app.id" class="pending-item">
          <div class="pending-info">
            <span class="pending-name">{{ app.applicant_name }}</span>
            <span class="pending-amount">{{ app.application_type === 'penalty' ? '-' : '+' }}{{ app.requested_stickers }}</span>
          </div>
          <router-link to="/applications" class="btn btn-sm btn-primary">去审批</router-link>
        </div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="quick-actions">
      <router-link to="/tasks" class="quick-btn">
        <span class="icon">📋</span>
        <span>全部任务</span>
      </router-link>
      <router-link to="/store" class="quick-btn">
        <span class="icon">🎁</span>
        <span>奖励商店</span>
      </router-link>
      <router-link to="/records" class="quick-btn">
        <span class="icon">📊</span>
        <span>我的记录</span>
      </router-link>
      <router-link v-if="authStore.isParent" to="/task-manage" class="quick-btn">
        <span class="icon">⚙️</span>
        <span>管理</span>
      </router-link>
    </div>

    <!-- 补贴入口（家长可见） -->
    <div v-if="authStore.isParent" class="subsidy-banner" @click="showSubsidyModal = true">
      <span class="icon">💝</span>
      <span>补贴贴纸（补卡）</span>
      <span class="arrow">→</span>
    </div>

    <!-- 补贴弹窗 -->
    <div v-if="showSubsidyModal" class="modal-overlay" @click="showSubsidyModal = false">
      <div class="modal" @click.stop>
        <div class="modal-title">💝 补贴贴纸</div>
        
        <div class="form-group">
          <label>选择孩子</label>
          <select v-model="subsidyForm.childId" class="input">
            <option value="">请选择</option>
            <option v-for="child in children" :key="child.id" :value="child.id">
              {{ child.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>补贴日期</label>
          <div class="date-selector">
            <button 
              v-for="n in 7" :key="n"
              :class="{ active: subsidyForm.daysAgo === n - 1 }"
              @click="subsidyForm.daysAgo = n - 1"
            >
              {{ n === 1 ? '昨天' : `${n}天前` }}
            </button>
          </div>
          <div class="selected-date">
            补贴日期：{{ getSubsidyDateText() }}
          </div>
        </div>

        <div class="form-group">
          <label>选择任务</label>
          <select v-model="subsidyForm.taskId" class="input">
            <option value="">请选择</option>
            <option v-for="task in habitTasks" :key="task.id" :value="task.id">
              {{ task.name }} (+{{ task.sticker_reward }}🎟️)
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>补贴贴纸数量</label>
          <div class="amount-input">
            <button @click="subsidyForm.stickerReward = Math.max(1, subsidyForm.stickerReward - 1)" class="btn btn-sm">-</button>
            <input v-model.number="subsidyForm.stickerReward" type="number" class="input" style="width: 60px; text-align: center" min="1">
            <button @click="subsidyForm.stickerReward++" class="btn btn-sm">+</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showSubsidyModal = false">取消</button>
          <button class="btn btn-primary" @click="submitSubsidy" :disabled="!canSubmitSubsidy">
            确认补贴
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()
const family = computed(() => authStore.family)
const todayTasks = ref([])
const pendingApps = ref([])
const loading = ref(false)
const submitting = ref(false)
const submittedToday = ref(false)

// 补贴相关
const showSubsidyModal = ref(false)
const children = ref([])
const habitTasks = ref([])
const subsidyForm = ref({
  childId: '',
  taskId: '',
  daysAgo: 1,
  stickerReward: 1
})

const canSubmitSubsidy = computed(() => {
  return subsidyForm.value.childId && subsidyForm.value.taskId && subsidyForm.value.stickerReward > 0
})

const getSubsidyDateText = () => {
  const date = new Date()
  date.setDate(date.getDate() - subsidyForm.value.daysAgo)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const submitSubsidy = async () => {
  if (!canSubmitSubsidy.value) return
  try {
    const subsidyDate = new Date()
    subsidyDate.setDate(subsidyDate.getDate() - subsidyForm.value.daysAgo)
    
    await api.post('/task/subsidy', {
      taskId: subsidyForm.value.taskId,
      memberId: subsidyForm.value.childId,
      subsidyDate: subsidyDate.toISOString().split('T')[0],
      stickerReward: subsidyForm.value.stickerReward,
      createdBy: authStore.member.id
    })
    
    alert('补贴成功！')
    showSubsidyModal.value = false
    subsidyForm.value = { childId: '', taskId: '', daysAgo: 1, stickerReward: 1 }
  } catch (e) {
    alert('补贴失败')
  }
}

const loadChildren = async () => {
  if (!authStore.isParent || !authStore.family?.id) return
  try {
    const res = await api.get(`/family/${authStore.family.id}/members`)
    if (res.success) {
      children.value = (res.members || []).filter(m => m.role === 'child')
    }
  } catch (e) {
    console.error('获取孩子列表失败', e)
  }
}

const loadAllHabitTasks = async () => {
  if (!authStore.family?.id) return
  try {
    const res = await api.get(`/task/family/${authStore.family.id}`, { params: { category: 'habit' } })
    if (res.success) {
      habitTasks.value = res.tasks || []
    }
  } catch (e) {
    console.error('获取任务失败', e)
  }
}

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 ${['日','一','二','三','四','五','六'][d.getDay()]}`
})

const hasCompletedTask = computed(() => {
  return todayTasks.value.some(t => t.is_completed_today > 0 && t.category !== 'bad_habit')
})

const loadTodayTasks = async () => {
  if (!authStore.member?.id || !authStore.family?.id) return
  loading.value = true
  try {
    const res = await api.get(`/task/family/${authStore.family.id}/today`, {
      params: { memberId: authStore.member.id }
    })
    if (res.success) {
      todayTasks.value = res.tasks || []
    }
  } catch (e) {
    console.error('获取今日任务失败', e)
  } finally {
    loading.value = false
  }
}

const loadPendingApps = async () => {
  if (!authStore.isParent || !authStore.family?.id) return
  try {
    const res = await api.get(`/application/pending/${authStore.family.id}`)
    if (res.success) {
      pendingApps.value = res.applications || []
    }
  } catch (e) {
    console.error('获取待审批失败', e)
  }
}

const toggleTask = async (task) => {
  if (task.is_completed_today > 0) return

  // 坏习惯需要确认
  if (task.category === 'bad_habit') {
    if (!confirm(`确认发生了「${task.name}」？\n\n将扣除 ${task.sticker_reward} 个贴纸`)) {
      return
    }
  }

  try {
    const res = await api.post(`/task/${task.id}/complete`, {
      memberId: authStore.member.id
    })
    task.is_completed_today = 1

    // 坏习惯扣贴纸后刷新余额，并向用户反馈实际扣除情况（余额不足时实际扣除可能少于请求）
    if (task.category === 'bad_habit') {
      await authStore.refreshMember()
      if (res?.actualDeduction !== undefined && res.actualDeduction < res.requestedAmount) {
        alert(`「${task.name}」已记录\n贴纸余额不足，实际扣除 ${res.actualDeduction} 个`)
      }
    }
  } catch (e) {
    console.error('完成任务失败', e)
  }
}

const submitDailyTasks = async () => {
  submitting.value = true
  try {
    // 找出已完成的好习惯任务（坏习惯不走审批，直接扣贴纸）
    const completedTasks = todayTasks.value.filter(t => t.is_completed_today > 0 && t.category !== 'bad_habit')
    for (const task of completedTasks) {
      await api.post('/application', {
        applicantId: authStore.member.id,
        taskId: task.id,
        applicationType: 'earn',
        requestedStickers: task.sticker_reward,
        reason: `完成「${task.name}」`
      })
    }
    submittedToday.value = true
    await authStore.refreshMember()
    await loadPendingApps()
  } catch (e) {
    console.error('提交失败', e)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadTodayTasks()
  loadPendingApps()
  loadChildren()
  loadAllHabitTasks()
})
</script>

<style scoped>
.role-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.role-badge.parent {
  background: var(--primary-light);
}

.role-badge.child {
  background: var(--secondary);
}

.balance-card {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 20px;
}

.balance-item {
  text-align: center;
}

.balance-item .icon {
  font-size: 36px;
  margin-bottom: 4px;
}

.balance-item .value {
  font-size: 32px;
  font-weight: 700;
}

.balance-item .label {
  font-size: 14px;
  opacity: 0.9;
}

.balance-item .progress-tip {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 4px;
}

.balance-divider {
  width: 1px;
  height: 60px;
  background: rgba(255,255,255,0.3);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  font-size: 18px;
}

.date {
  color: var(--text-light);
  font-size: 14px;
}

.view-more {
  color: var(--primary);
  text-decoration: none;
  font-size: 14px;
}

.pending-card {
  background: linear-gradient(135deg, #FFF9E6, #FFF);
  border-left: 4px solid var(--secondary);
}

.pending-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #F0F0F0;
}

.pending-item:last-child {
  border-bottom: none;
}

.pending-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pending-name {
  font-weight: 500;
}

.pending-amount {
  background: var(--primary-light);
  color: var(--primary-dark);
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 600;
}

.submit-success {
  text-align: center;
  color: var(--accent);
  padding: 12px;
  background: #E8F5E9;
  border-radius: var(--radius-sm);
  margin-top: 12px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 20px;
}

.quick-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  background: white;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text);
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.quick-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.quick-btn .icon {
  font-size: 28px;
}

.quick-btn span:last-child {
  font-size: 12px;
  font-weight: 500;
}

/* 补贴入口 */
.subsidy-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #FFF9E6, #FFF3E0);
  border-radius: var(--radius);
  margin-top: 16px;
  cursor: pointer;
  border: 1px dashed #FFB74D;
}

.subsidy-banner .icon {
  font-size: 24px;
}

.subsidy-banner span:nth-child(2) {
  flex: 1;
  font-weight: 600;
  color: #E65100;
}

.subsidy-banner .arrow {
  color: #FF9800;
  font-weight: bold;
}

/* 坏习惯任务样式 */
.task-item.bad-habit {
  background: #FFF8F8;
  border: 1px solid #FFCDD2;
}

.task-item.bad-habit .checkbox {
  border-color: #FF6B6B;
}

.task-item.bad-habit .checkbox.bad-habit-check.checked {
  background: #FF6B6B;
}

.task-item.bad-habit .checkbox.bad-habit-check.checked span {
  color: white;
}

.tag-warn {
  background: #FFF3E0;
  color: #FF9800;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 6px;
}

/* 待办任务样式 */
.task-item.todo-task {
  background: #FFFDE7;
  border: 1px solid #FFF59D;
}

.task-item.todo-task .checkbox {
  border-color: #FFC107;
}

.task-item.todo-task .checkbox.todo-check.checked {
  background: #FFC107;
}

.task-item.todo-task .checkbox.todo-check.checked span {
  color: white;
}

.tag-todo {
  background: #FFF8E1;
  color: #F57C00;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 6px;
}

.reward.penalty {
  background: #FFEBEE !important;
  color: #E53935 !important;
}

/* 补贴弹窗 */
.date-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.date-selector button {
  padding: 8px 12px;
  border: 2px solid #E8E8E8;
  background: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
}

.date-selector button.active {
  border-color: var(--primary);
  background: var(--primary-light);
  color: var(--primary);
}

.selected-date {
  margin-top: 8px;
  font-size: 14px;
  color: var(--text-light);
}

/* 弹窗通用样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: var(--radius);
  padding: 24px;
  max-width: 360px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.amount-input {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-actions .btn {
  flex: 1;
}
</style>
