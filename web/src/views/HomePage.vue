<template>
  <div class="page">
    <!-- 头部 -->
    <div class="header">
      <div>
        <h1>🏅 奖章星球</h1>
        <p style="font-size: 14px; opacity: 0.9;">{{ authStore.family?.name || '' }} · {{ authStore.member?.name }}</p>
      </div>
      <div class="role-badge" :class="authStore.isParent ? 'parent' : 'child'">
        <Avatar :avatar="authStore.member?.avatar" :name="authStore.member?.name" :role="authStore.member?.role" :size="34" />
      </div>
    </div>

    <!-- 余额卡片 -->
    <div class="balance-card">
      <div class="balance-item">
        <div class="icon">{{ cur[0] }}</div>
        <div class="value">{{ authStore.member?.current_stickers || 0 }}</div>
        <div class="label">贴纸</div>
      </div>
      <div class="balance-divider"></div>
      <div class="balance-item">
        <div class="icon">{{ cur[1] }}</div>
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
          class="task-item clickable"
          :class="{
            completed: isTaskDone(task) && task.category !== 'bad_habit',
            'bad-habit': task.category === 'bad_habit',
            'todo-task': task.category === 'temporary'
          }"
          @click="toggleTask(task)"
        >
          <div class="checkbox" :class="{
            checked: isTaskDone(task),
            'bad-habit-check': task.category === 'bad_habit',
            'todo-check': task.category === 'temporary'
          }">
            <span v-if="isTaskDone(task)">{{ task.category === 'bad_habit' ? '✗' : '✓' }}</span>
          </div>
          <div class="task-main">
            <div class="task-name">
              {{ task.name }}
              <span v-if="task.category === 'bad_habit'" class="tag tag-warn">坏习惯</span>
              <span v-else-if="task.category === 'temporary'" class="tag tag-todo">待办</span>
            </div>
            <div v-if="task.target_count > 1" class="mt-progress" :title="'目标 ' + task.target_count + ' 次：每完成一次点一下整行计数；底部「提交今日完成」按次数 × 单次奖励等待审批'">
              <div class="mt-bar">
                <div class="mt-fill" :style="{ width: Math.min(100, (task.count_today || 0) / task.target_count * 100) + '%' }"></div>
              </div>
              <span class="mt-text">{{ task.count_today || 0 }}/{{ task.target_count }}</span>
              <span v-if="(task.pending_count || 0) > 0" class="mt-pending">待审{{ task.pending_count }}</span>
              <span
                v-if="zOf(task) > 0"
                class="count-minus"
                title="减一次（只影响未提交的计数）"
                @click.stop="decrementTask(task)"
              >－</span>
            </div>
          </div>
          <div class="reward" :class="{ penalty: task.category === 'bad_habit' }">
            {{ task.category === 'bad_habit' ? '-' : '+' }}{{ task.sticker_reward }} {{ cur[0] }}
          </div>
        </div>

        <button
          v-if="hasCompletedTask"
          class="btn btn-primary"
          style="width: 100%; margin-top: 16px"
          @click="submitDailyTasks"
          :disabled="submitting"
        >
          {{ submitting ? '提交中...' : '📤 提交今日完成（共 ' + totalSubmittable + ' 次）' }}
        </button>

        <div v-if="allSubmitted" class="submit-success">
          ✅ 今日完成量已全部提交，等待家长审批
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
              {{ task.name }} (+{{ task.sticker_reward }}{{ cur[0] }})
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
import { localDateStr } from '../utils/date'
import { themeCurrencies } from '../utils/theme'
import Avatar from '../components/Avatar.vue'
import api from '../api'

const authStore = useAuthStore()
// 货币图标随主题（[贴纸, 粉球]）
const cur = computed(() => themeCurrencies())
const todayTasks = ref([])
const pendingApps = ref([])
const loading = ref(false)
const submitting = ref(false)

// 补贴相关（家长）
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
      subsidyDate: localDateStr(subsidyDate),
      stickerReward: subsidyForm.value.stickerReward
    })

    alert('补贴成功！')
    showSubsidyModal.value = false
    subsidyForm.value = { childId: '', taskId: '', daysAgo: 1, stickerReward: 1 }
  } catch (e) {
    const msg = e?.response?.data?.error || '补贴失败'
    alert(msg)
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

// 剩余可提交量（服务端权威计算：当日完成 - 待审 - 已批）
const zOf = (task) => task.unsubmitted_count || 0

const hasCompletedTask = computed(() => {
  return todayTasks.value.some(t => t.category !== 'bad_habit' && zOf(t) > 0)
})

// 底部按钮显示的总可提交次数
const totalSubmittable = computed(() => {
  return todayTasks.value
    .filter(t => t.category !== 'bad_habit')
    .reduce((sum, t) => sum + zOf(t), 0)
})

const allSubmitted = computed(() => {
  if (loading.value) return false
  const normal = todayTasks.value.filter(t => t.category !== 'bad_habit')
  return normal.length > 0 && normal.every(t => zOf(t) === 0) && normal.some(t => (t.count_today || 0) > 0)
})

// 任务今日是否算"完成"：完成量已全部提交（无剩余可提交）即算
const isTaskDone = (task) => {
  return (task.count_today || 0) > 0 && zOf(task) === 0
}

const loadTodayTasks = async () => {
  if (!authStore.member?.id || !authStore.family?.id) return
  loading.value = true
  try {
    const res = await api.get(`/task/family/${authStore.family.id}/today`, {
      params: { memberId: authStore.member.id, date: localDateStr() }
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

// 多计数任务递减一次（纠错用，无弹窗；服务端保证不会减到已提交/已批的量）
const decrementTask = async (task) => {
  try {
    await api.post(`/task/${task.id}/uncomplete`, {
      date: localDateStr(),
      count: 1
    })
    await loadTodayTasks()
  } catch (e) {
    alert(e?.response?.data?.error || '操作失败')
  }
}

const toggleTask = async (task) => {
  const count = task.count_today || 0

  // 坏习惯：家长记录，一天一次，扣贴纸前确认
  if (task.category === 'bad_habit') {
    if (count >= 1) return
    if (!confirm(`确认记录坏习惯「${task.name}」？\n\n将扣除 ${task.sticker_reward} 个贴纸`)) {
      return
    }
  }

  // 已全部提交（无剩余可提交量）的任务锁定，不能再改动
  if (task.category !== 'bad_habit' && zOf(task) === 0 && count > 0) return

  try {
    const res = await api.post(`/task/${task.id}/complete`, {
      date: localDateStr()
    })
    // 待审/剩余量由服务端计算，操作后重新拉取保持账目一致
    await loadTodayTasks()

    // 坏习惯扣贴纸后刷新余额，并向用户反馈实际扣除情况（余额不足时实际扣除可能少于请求）
    if (task.category === 'bad_habit') {
      await authStore.refreshMember()
      if (res?.actualDeduction !== undefined && res.actualDeduction < res.requestedAmount) {
        alert(`「${task.name}」已记录\n贴纸余额不足，实际扣除 ${res.actualDeduction} 个`)
      }
    }
  } catch (e) {
    console.error('完成任务失败', e)
    alert(e?.response?.data?.error || '打卡失败')
  }
}

// 批量提交：把所有任务剩余可提交量一次性提交
const submitDailyTasks = async () => {
  submitting.value = true
  try {
    const targets = todayTasks.value.filter(t => t.category !== 'bad_habit' && zOf(t) > 0)
    for (const task of targets) {
      await api.post(`/task/${task.id}/submit`)
    }
    await loadTodayTasks()
    await loadPendingApps()
    if (targets.length > 0) alert(`已提交 ${targets.length} 项任务，等待家长审批`)
  } catch (e) {
    alert(e?.response?.data?.error || '提交失败')
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
  overflow: hidden;
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
  align-items: stretch;
  gap: 10px;
  padding: 16px;
}

.balance-item {
  text-align: center;
  flex: 1;
  border-radius: 16px;
  padding: 14px 8px 12px;
}

/* 贴纸筹码（奶油黄）/ 粉球筹码（软紫） */
.balance-item:first-child {
  background: var(--secondary-light);
}

.balance-item:last-child {
  background: var(--purple-light);
}

.balance-item .icon {
  font-size: 36px;
  margin-bottom: 4px;
}

.balance-item .value {
  font-size: 32px;
  font-weight: 700;
  font-family: var(--font-display);
}

.balance-item .label {
  font-size: 14px;
  opacity: 0.9;
}

.balance-item .progress-tip {
  font-size: 11px;
  color: #8A7C5E;
  margin-top: 4px;
}

.balance-divider {
  display: none;
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

/* 任务行交互 */
.task-item.clickable {
  cursor: pointer;
}

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

.task-main {
  flex: 1;
  min-width: 0;
}

/* 多计数任务进度条 */
.mt-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.mt-bar {
  flex: 1;
  height: 10px;
  background: var(--line);
  border-radius: 5px;
  overflow: hidden;
}

.mt-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 5px;
  transition: width 0.25s ease;
}

.mt-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-dark);
  font-family: var(--font-display);
  white-space: nowrap;
}

.mt-pending {
  font-size: 11px;
  font-weight: 700;
  color: #6F5BD6;
  background: var(--purple-light);
  padding: 2px 8px;
  border-radius: 8px;
  white-space: nowrap;
}

.count-minus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--coral-light);
  color: #D6553F;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.count-minus:hover {
  background: #FFCDD2;
}

.tag-sky {
  background: #E3F2FD;
  color: #1976D2;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 6px;
}
</style>
