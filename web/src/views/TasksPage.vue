<template>
  <div class="page">
    <div class="header">
      <h1>📋 任务列表</h1>
    </div>

    <!-- 筛选 -->
    <div class="filter-tabs">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'habit' }" @click="filter = 'habit'">好习惯</button>
      <button v-if="authStore.isParent" :class="{ active: filter === 'bad_habit' }" @click="filter = 'bad_habit'">坏习惯</button>
      <button :class="{ active: filter === 'temporary' }" @click="filter = 'temporary'">临时任务</button>
    </div>

    <!-- 好习惯任务 -->
    <div class="card" v-if="filter === 'all' || filter === 'habit'">
      <h3>🕐 好习惯</h3>
      <div v-if="habitTasks.length === 0" class="empty-state" style="padding: 20px">
        <p>暂无好习惯任务</p>
      </div>
      <div v-else>
        <div v-for="task in habitTasks" :key="task.id" class="task-item">
          <div class="task-info">
            <div class="task-name">{{ task.name }}</div>
            <div class="task-meta">
              <span class="tag tag-sky">{{ getRepeatText(task) }}</span>
              <span v-if="task.target_count > 1" class="tag tag-gold">
                {{ task.accumulative_mode === 'cumulative' ? '累计' : '达标' }}型 · {{ task.target_count }}次
              </span>
            </div>
          </div>
          <div class="reward">+{{ task.sticker_reward }} {{ cur[0] }}</div>
        </div>
      </div>
    </div>

    <!-- 坏习惯任务 -->
    <div class="card bad-habit-card" v-if="authStore.isParent && (filter === 'all' || filter === 'bad_habit')">
      <h3>⚠️ 坏习惯</h3>
      <div v-if="badHabitTasks.length === 0" class="empty-state" style="padding: 20px">
        <p>暂无坏习惯任务</p>
      </div>
      <div v-else>
        <div v-for="task in badHabitTasks" :key="task.id" class="task-item bad-habit-item">
          <div class="task-info">
            <div class="task-name">{{ task.name }}</div>
            <div class="task-meta">
              <span class="tag tag-red">{{ getRepeatText(task) }}</span>
              <span class="tag tag-warn">每次扣{{ task.sticker_reward }}贴纸</span>
            </div>
          </div>
          <div class="reward penalty">-{{ task.sticker_reward }} {{ cur[0] }}</div>
        </div>
      </div>
    </div>

    <!-- 临时任务 -->
    <div class="card" v-if="filter === 'all' || filter === 'temporary'">
      <h3>⚡ 临时任务</h3>
      <div v-if="tempTasks.length === 0" class="empty-state" style="padding: 20px">
        <p>暂无临时任务</p>
      </div>
      <div v-else>
        <div v-for="task in tempTasks" :key="task.id" class="task-item">
          <div class="task-info">
            <div class="task-name">{{ task.name }}</div>
            <div class="task-meta">
              <span class="tag tag-orange">
                {{ task.valid_days ? `有效期${task.valid_days}天` : '仅限当天' }}
              </span>
            </div>
          </div>
          <div class="reward">+{{ task.sticker_reward }} {{ cur[0] }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { themeCurrencies } from '../utils/theme'
import api from '../api'

const authStore = useAuthStore()
const tasks = ref([])
const filter = ref('all')
const cur = computed(() => themeCurrencies())

const habitTasks = computed(() => tasks.value.filter(t => t.category === 'habit'))
// 坏习惯由家长记录：孩子端不展示
const badHabitTasks = computed(() => authStore.isParent ? tasks.value.filter(t => t.category === 'bad_habit') : [])
const tempTasks = computed(() => tasks.value.filter(t => t.category === 'temporary'))

const getRepeatText = (task) => {
  const ruleMap = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    custom: `自定义${task.custom_days}天`
  }
  return ruleMap[task.repeat_rule] || '每天'
}

const loadTasks = async () => {
  if (!authStore.family?.id) return
  try {
    const res = await api.get(`/task/family/${authStore.family.id}`)
    if (res.success) {
      tasks.value = res.tasks || []
    }
  } catch (e) {
    console.error('获取任务失败', e)
  }
}

onMounted(() => {
  loadTasks()
})
</script>

<style scoped>
.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.filter-tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  background: var(--card-bg);
  border-radius: var(--radius-sm);
  color: var(--text-light);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-tabs button.active {
  background: var(--primary);
  color: white;
}

.card h3 {
  margin-bottom: 14px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card-bg);
  margin-bottom: 10px;
}

.task-item:last-child {
  margin-bottom: 0;
}

.task-info {
  flex: 1;
}

.task-name {
  font-weight: 500;
  font-size: 15px;
  margin-bottom: 4px;
}

.task-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
}

.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.tag-sky { background: #E3F2FD; color: #1565C0; }
.tag-gold { background: #FFF8E1; color: #82600F; }
.tag-orange { background: #FFF3E0; color: #B45309; }
.tag-red { background: #FFEBEE; color: #C62828; }
.tag-warn { background: #FFF3E0; color: #82600F; }

.bad-habit-card {
  border-left: 4px solid #FF6B6B;
}

.bad-habit-item {
  background: var(--coral-light) !important;
}

/* 奖励徽章样式统一走 main.css 的 .task-item .reward（含夜间模式亮色适配） */
</style>
