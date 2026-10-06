<template>
  <div class="page">
    <div class="header">
      <h1>📝 任务管理</h1>
      <button class="btn btn-sm btn-primary" @click="showTemplateModal = true">+ 添加任务</button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>

    <div v-else>
      <!-- 好习惯任务列表 -->
      <div class="card">
        <div class="section-header-row">
          <h3><Icon name="chevron-up" :size="16" style="margin-right: 4px;" />好习惯</h3>
          <span class="count-badge">{{ habitTasks.length }}个</span>
        </div>
        <div v-if="habitTasks.length === 0" class="empty-state" style="padding: 20px">
          <p>暂无好习惯任务，点击上方添加</p>
        </div>
        <div v-else class="task-list">
          <div v-for="task in habitTasks" :key="task.id" class="task-manage-item">
            <div class="task-main">
              <div class="task-manage-info">
                <div class="task-name">{{ task.name }}</div>
                <div class="task-meta">
                  <span class="reward">+{{ task.sticker_reward }} 🎟️</span>
                  <span class="tag tag-sky">{{ getRepeatText(task) }}</span>
                  <span v-if="task.target_count > 1" class="tag tag-gold">
                    目标 {{ task.target_count }} 次/天
                  </span>
                </div>
              </div>
            </div>
            <div class="task-actions">
              <button class="btn btn-sm" @click="editTask(task)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 坏习惯任务列表 -->
      <div class="card bad-habit-section">
        <div class="section-header-row">
          <h3>⚠️ 坏习惯</h3>
          <span class="count-badge">{{ badHabitTasks.length }}个</span>
        </div>
        <div v-if="badHabitTasks.length === 0" class="empty-state" style="padding: 20px">
          <p>暂无坏习惯任务</p>
        </div>
        <div v-else class="task-list">
          <div v-for="task in badHabitTasks" :key="task.id" class="task-manage-item bad-habit-item">
            <div class="task-main">
              <div class="task-manage-info">
                <div class="task-name">{{ task.name }}</div>
                <div class="task-meta">
                  <span class="reward penalty">-{{ task.sticker_reward }} 🎟️</span>
                  <span class="tag tag-red">{{ getRepeatText(task) }}</span>
                  <span class="tag tag-warn">每次扣除</span>
                </div>
              </div>
            </div>
            <div class="task-actions">
              <button class="btn btn-sm" @click="editTask(task)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 临时任务列表 -->
      <div class="card">
        <div class="section-header-row">
          <h3><Icon name="add" :size="16" style="margin-right: 4px;" />临时任务</h3>
          <span class="count-badge">{{ tempTasks.length }}个</span>
        </div>
        <div v-if="tempTasks.length === 0" class="empty-state" style="padding: 20px">
          <p>暂无临时任务</p>
        </div>
        <div v-else class="task-list">
          <div v-for="task in tempTasks" :key="task.id" class="task-manage-item">
            <div class="task-main">
              <div class="task-manage-info">
                <div class="task-name">{{ task.name }}</div>
                <div class="task-meta">
                  <span class="reward">+{{ task.sticker_reward }}<Icon name="check" :size="14" style="margin-left: 2px;" /></span>
                  <span class="tag tag-orange">
                    {{ task.valid_days ? `有效期${task.valid_days}天` : '仅限当天' }}
                  </span>
                </div>
              </div>
            </div>
            <div class="task-actions">
              <button class="btn btn-sm" @click="editTask(task)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板选择弹窗 -->
    <div v-if="showTemplateModal" class="modal-overlay" @click="closeTemplateModal">
      <div class="modal modal-lg" @click.stop>
        <div class="modal-title">选择模板</div>
        
        <div class="template-grid">
          <div 
            v-for="template in templates" 
            :key="template.id"
            :class="['template-card', { selected: selectedTemplates.includes(template.id) }]"
            @click="toggleTemplate(template.id)"
          >
            <div class="template-icon">{{ template.icon }}</div>
            <div class="template-name">{{ template.name }}</div>
            <div class="template-count">{{ template.tasks.length }}个任务</div>
            <div v-if="selectedTemplates.includes(template.id)" class="template-check">✓</div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeTemplateModal">取消</button>
          <button class="btn btn-primary" @click="confirmTemplates" :disabled="selectedTemplates.length === 0">
            下一步 ({{ selectedTemplates.length }})
          </button>
        </div>
      </div>
    </div>

    <!-- 自定义编辑弹窗（每个任务单独编辑） -->
    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
      <div class="modal modal-xl" @click.stop>
        <div class="modal-title-row">
          <span class="modal-title">编辑任务（共 {{ editTasks.length }} 个）</span>
          <div class="modal-title-actions">
            <button class="btn btn-sm" @click="showAddTasksPrompt">+ 添加</button>
            <button class="btn btn-sm btn-danger" @click="batchDeleteSelected" :disabled="selectedTaskIndices.length === 0">
              删除 ({{ selectedTaskIndices.length }})
            </button>
          </div>
        </div>
        
        <!-- 快速批量设置 -->
        <div class="quick-batch">
          <div class="batch-row">
            <span>快速设置：</span>
            <div class="batch-buttons">
              <button class="btn btn-sm" :class="{ active: batchCategory === 'habit' }" @click="applyBatchCategory('habit')">好习惯</button>
              <button class="btn btn-sm" :class="{ active: batchCategory === 'bad_habit' }" @click="applyBatchCategory('bad_habit')">坏习惯</button>
              <button class="btn btn-sm" :class="{ active: batchCategory === 'temporary' }" @click="applyBatchCategory('temporary')">临时</button>
            </div>
          </div>
          <div class="batch-row" v-if="batchCategory === 'habit'">
            <span>重复规则：</span>
            <div class="batch-buttons">
              <button class="btn btn-sm" :class="{ active: batchRepeatRule === 'daily' }" @click="applyBatchRepeatRule('daily')">每天</button>
              <button class="btn btn-sm" :class="{ active: batchRepeatRule === 'weekly' }" @click="applyBatchRepeatRule('weekly')">每周</button>
              <button class="btn btn-sm" :class="{ active: batchRepeatRule === 'monthly' }" @click="applyBatchRepeatRule('monthly')">每月</button>
            </div>
          </div>
          <div class="batch-row" v-if="batchCategory === 'temporary'">
            <span>有效期：</span>
            <div class="batch-buttons">
              <button class="btn btn-sm" :class="{ active: batchValidDays === 0 }" @click="applyBatchValidDays(0)">当天</button>
              <button class="btn btn-sm" :class="{ active: batchValidDays === 3 }" @click="applyBatchValidDays(3)">3天</button>
              <button class="btn btn-sm" :class="{ active: batchValidDays === 7 }" @click="applyBatchValidDays(7)">7天</button>
              <button class="btn btn-sm" :class="{ active: batchValidDays === 14 }" @click="applyBatchValidDays(14)">14天</button>
              <button class="btn btn-sm" :class="{ active: batchValidDays === 30 }" @click="applyBatchValidDays(30)">30天</button>
            </div>
          </div>
        </div>

        <!-- 任务列表编辑 -->
        <div class="task-edit-list">
          <div v-for="(task, index) in editTasks" :key="index" class="task-edit-item">
            <!-- 任务名称和展开按钮 -->
            <div class="task-edit-header" @click="toggleTaskExpand(index)">
              <input 
                type="checkbox" 
                class="task-checkbox"
                :checked="selectedTaskIndices.includes(index)"
                @click.stop
                @change="toggleTaskSelection(index)"
              >
              <input 
                v-model="task.name" 
                type="text" 
                class="input task-name-input" 
                placeholder="任务名称"
              >
              <div class="task-edit-summary">
                <span class="reward" :class="{ penalty: task.category === 'bad_habit' }">
                  {{ task.category === 'bad_habit' ? '-' : '+' }}{{ task.stickerReward }}<Icon name="check" :size="14" style="margin-left: 2px;" />
                </span>
                <span class="tag tag-sm" :class="task.category === 'habit' ? 'tag-sky' : (task.category === 'bad_habit' ? 'tag-red' : 'tag-orange')">
                  {{ task.category === 'temporary' ? (task.validDays > 0 ? task.validDays + '天' : '当天') : getRepeatLabel(task.repeatRule) }}
                </span>
                <span v-if="task.category === 'habit' && task.targetCount > 1" class="tag tag-sm tag-gold">
                  {{ task.targetCount }}次
                </span>
                <span class="delete-icon" @click.stop="removeTask(index)"><Icon name="minus" :size="16" /></span>
              </div>
              <span class="expand-icon"><Icon :name="expandedIndex === index ? 'chevron-up' : 'chevron-down'" :size="14" /></span>
            </div>
            
            <!-- 展开的详细设置 -->
            <div v-if="expandedIndex === index" class="task-edit-detail">
              <div class="detail-row">
                <label>类型</label>
                <div class="type-selector">
                  <button :class="{ active: task.category === 'habit' }" @click="task.category = 'habit'"><Icon name="chevron-up" :size="14" style="margin-right: 4px;" />好习惯</button>
                  <button :class="{ active: task.category === 'bad_habit' }" @click="task.category = 'bad_habit'">⚠️ 坏习惯</button>
                  <button :class="{ active: task.category === 'temporary' }" @click="task.category = 'temporary'"><Icon name="add" :size="14" style="margin-right: 4px;" />临时</button>
                </div>
              </div>

              <div v-if="task.category === 'habit' || task.category === 'bad_habit'" class="detail-row">
                <label>重复</label>
                <div class="repeat-selector">
                  <button :class="{ active: task.repeatRule === 'daily' }" @click="task.repeatRule = 'daily'">每天</button>
                  <button :class="{ active: task.repeatRule === 'weekly' }" @click="task.repeatRule = 'weekly'">每周</button>
                  <button :class="{ active: task.repeatRule === 'monthly' }" @click="task.repeatRule = 'monthly'">每月</button>
                </div>
              </div>

              <div v-if="task.category === 'habit'" class="detail-row">
                <label>目标</label>
                <div class="target-selector">
                  <span class="text">每次完成</span>
                  <button @click="task.targetCount = Math.max(1, task.targetCount - 1)" class="btn btn-sm">-</button>
                  <input v-model.number="task.targetCount" type="number" class="input input-sm" min="1">
                  <button @click="task.targetCount++" class="btn btn-sm">+</button>
                  <span class="text">次得奖励</span>
                </div>
              </div>

              <div v-if="task.category === 'habit' && task.targetCount > 1" class="detail-row">
                <p class="mode-hint">
                  孩子每完成一次点一下计数，可分次提交；奖励 = 单次奖励 × 当日完成次数（如喝水：一杯一点，按杯数给贴纸）。
                </p>
              </div>

              <div v-if="task.category === 'temporary'" class="detail-row">
                <label>有效期</label>
                <div class="valid-selector">
                  <button :class="{ active: task.validDays === 0 }" @click="task.validDays = 0">仅限当天</button>
                  <button :class="{ active: task.validDays === 3 }" @click="task.validDays = 3">3天</button>
                  <button :class="{ active: task.validDays === 7 }" @click="task.validDays = 7">7天</button>
                  <button :class="{ active: task.validDays === 14 }" @click="task.validDays = 14">14天</button>
                  <button :class="{ active: task.validDays === 30 }" @click="task.validDays = 30">30天</button>
                </div>
              </div>

              <div class="detail-row">
                <label>{{ task.category === 'bad_habit' ? '扣除数量' : '奖励' }}</label>
                <div class="reward-selector">
                  <button @click="task.stickerReward = Math.max(1, task.stickerReward - 1)" class="btn btn-sm"><Icon name="minus" :size="14" /></button>
                  <input v-model.number="task.stickerReward" type="number" class="input input-sm" min="1">
                  <button @click="task.stickerReward++" class="btn btn-sm"><Icon name="add" :size="14" /></button>
                  <Icon name="check" :size="16" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeEditModal">取消</button>
          <button class="btn btn-primary" @click="saveAllTasks" :disabled="editTasks.length === 0">
            保存全部
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑单个任务弹窗 -->
    <div v-if="showSingleEditModal" class="modal-overlay" @click="closeSingleEditModal">
      <div class="modal" @click.stop>
        <div class="modal-title">编辑任务</div>
        
        <div class="form-group">
          <label>任务名称</label>
          <input v-model="singleEditForm.name" type="text" class="input" placeholder="任务名称">
        </div>

        <div class="form-group">
          <label>奖励贴纸</label>
          <div class="amount-input">
            <button @click="singleEditForm.stickerReward = Math.max(1, singleEditForm.stickerReward - 1)" class="btn btn-sm">-</button>
            <input v-model.number="singleEditForm.stickerReward" type="number" class="input" style="width: 60px; text-align: center">
            <button @click="singleEditForm.stickerReward++" class="btn btn-sm">+</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeSingleEditModal">取消</button>
          <button class="btn btn-primary" @click="saveSingleTask">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import Icon from '../components/IconPark.vue'

const authStore = useAuthStore()
const tasks = ref([])
const loading = ref(false)

// 模板相关
const showTemplateModal = ref(false)
const showEditModal = ref(false)
const showSingleEditModal = ref(false)
const selectedTemplates = ref([])
const editTasks = ref([])
const expandedIndex = ref(-1)
const selectedTaskIndices = ref([])

// 批量设置（快速设置）
const batchCategory = ref('habit')
const batchRepeatRule = ref('daily')
const batchValidDays = ref(0)

// 单个编辑
const editingTask = ref(null)
const singleEditForm = ref({
  name: '',
  stickerReward: 1
})

// 模板数据
const templates = ref([
  {
    id: 'study',
    name: '学习',
    icon: '📚',
    tasks: ['按时完成作业', '预习下一课', '复习错题', '阅读30分钟', '练字15分钟']
  },
  {
    id: 'sleep',
    name: '睡觉',
    icon: '😴',
    tasks: ['按时睡觉', '早起不赖床', '自己整理床铺']
  },
  {
    id: 'water',
    name: '喝水',
    icon: '💧',
    tasks: ['喝5杯水']
  },
  {
    id: 'meal',
    name: '吃饭',
    icon: '🍽️',
    tasks: ['不挑食', '光盘行动', '饭后收拾碗筷']
  },
  {
    id: 'exercise',
    name: '锻炼',
    icon: '🏃',
    tasks: ['户外运动30分钟', '跳绳100个', '做眼保健操']
  },
  {
    id: 'read',
    name: '看书',
    icon: '📖',
    tasks: ['阅读课外书']
  },
  {
    id: 'housework',
    name: '家务',
    icon: '🏠',
    tasks: ['整理房间', '扫地', '倒垃圾', '洗碗', '叠衣服']
  },
  {
    id: 'hygiene',
    name: '卫生',
    icon: '🧼',
    tasks: ['刷牙', '洗脸', '洗手', '洗澡']
  },
  {
    id: 'hobby',
    name: '兴趣',
    icon: '🎨',
    tasks: ['画画', '练琴', '下棋']
  },
  {
    id: 'finance',
    name: '理财',
    icon: '💰',
    tasks: ['存钱计划']
  },
  {
    id: 'social',
    name: '社交',
    icon: '🤝',
    tasks: ['帮助家人', '主动问好', '分享玩具']
  }
])

const habitTasks = computed(() => tasks.value.filter(t => t.category === 'habit'))
const badHabitTasks = computed(() => tasks.value.filter(t => t.category === 'bad_habit'))
const tempTasks = computed(() => tasks.value.filter(t => t.category === 'temporary'))

const toggleTemplate = (id) => {
  const idx = selectedTemplates.value.indexOf(id)
  if (idx > -1) {
    selectedTemplates.value.splice(idx, 1)
  } else {
    selectedTemplates.value.push(id)
  }
}

const closeTemplateModal = () => {
  showTemplateModal.value = false
  selectedTemplates.value = []
}

const confirmTemplates = () => {
  editTasks.value = []
  selectedTemplates.value.forEach(templateId => {
    const template = templates.value.find(t => t.id === templateId)
    if (template) {
      template.tasks.forEach(taskName => {
        editTasks.value.push({
          name: taskName,
          stickerReward: 1,
          category: 'habit',
          repeatRule: 'daily',
          validDays: 0,
          targetCount: 1
        })
      })
    }
  })
  
  showTemplateModal.value = false
  showEditModal.value = true
  expandedIndex.value = -1
}

const toggleTaskExpand = (index) => {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

const removeTask = (index) => {
  editTasks.value.splice(index, 1)
  selectedTaskIndices.value = selectedTaskIndices.value
    .filter(i => i !== index)
    .map(i => i > index ? i - 1 : i)
  if (expandedIndex.value >= index) {
    expandedIndex.value = -1
  }
}

const toggleTaskSelection = (index) => {
  const idx = selectedTaskIndices.value.indexOf(index)
  if (idx === -1) {
    selectedTaskIndices.value.push(index)
  } else {
    selectedTaskIndices.value.splice(idx, 1)
  }
}

const batchDeleteSelected = () => {
  if (selectedTaskIndices.value.length === 0) return
  if (!confirm(`确定删除选中的 ${selectedTaskIndices.value.length} 个任务吗？`)) return
  
  // 从大到小排序，确保删除不会影响索引
  const indicesToDelete = [...selectedTaskIndices.value].sort((a, b) => b - a)
  indicesToDelete.forEach(i => {
    editTasks.value.splice(i, 1)
  })
  selectedTaskIndices.value = []
  expandedIndex.value = -1
}

const showAddTasksPrompt = () => {
  const count = prompt('请输入要添加的任务数量：', '1')
  if (!count) return
  const num = parseInt(count)
  if (isNaN(num) || num < 1 || num > 50) {
    alert('请输入1-50之间的数字')
    return
  }
  addTasks(num)
}

const addTasks = (count) => {
  for (let i = 0; i < count; i++) {
    editTasks.value.push({
      name: '',
      category: batchCategory.value,
      repeatRule: batchRepeatRule.value,
      targetCount: 1,
      validDays: batchValidDays.value,
      stickerReward: 1
    })
  }
}

const applyBatchCategory = (category) => {
  batchCategory.value = category
  editTasks.value.forEach(t => {
    t.category = category
    if (category === 'habit') {
      t.validDays = 0
      t.repeatRule = batchRepeatRule.value
    } else if (category === 'bad_habit') {
      t.validDays = 0
      t.repeatRule = batchRepeatRule.value
      t.targetCount = 1
    } else {
      t.validDays = batchValidDays.value
      t.repeatRule = 'daily'
      t.targetCount = 1
    }
  })
}

const applyBatchRepeatRule = (rule) => {
  batchRepeatRule.value = rule
  editTasks.value.forEach(t => {
    if (t.category === 'habit') {
      t.repeatRule = rule
    }
  })
}

const applyBatchValidDays = (days) => {
  batchValidDays.value = days
  editTasks.value.forEach(t => {
    if (t.category === 'temporary') {
      t.validDays = days
    }
  })
}

const closeEditModal = () => {
  showEditModal.value = false
  editTasks.value = []
  selectedTaskIndices.value = []
  expandedIndex.value = -1
}

const saveAllTasks = async () => {
  if (editTasks.value.length === 0) return
  
  try {
    const tasksToSave = editTasks.value.map(t => ({
      name: t.name,
      description: '',
      category: t.category,
      repeatRule: (t.category === 'habit' || t.category === 'bad_habit') ? t.repeatRule : 'daily',
      customDays: null,
      targetCount: t.category === 'bad_habit' ? 1 : t.targetCount,
      validDays: t.category === 'temporary' ? t.validDays : null,
      stickerReward: t.stickerReward
    }))

    await api.post('/task/batch', {
      familyId: authStore.family.id,
      tasks: tasksToSave,
      createdBy: authStore.member.id
    })

    await loadTasks()
    closeEditModal()
  } catch (e) {
    alert('保存失败')
  }
}

const editTask = (task) => {
  editingTask.value = task
  singleEditForm.value = {
    name: task.name,
    stickerReward: task.sticker_reward
  }
  showSingleEditModal.value = true
}

const closeSingleEditModal = () => {
  showSingleEditModal.value = false
  editingTask.value = null
}

const saveSingleTask = async () => {
  try {
    await api.put(`/task/${editingTask.value.id}`, {
      name: singleEditForm.value.name,
      stickerReward: singleEditForm.value.stickerReward
    })
    await loadTasks()
    closeSingleEditModal()
  } catch (e) {
    alert('保存失败')
  }
}

const deleteTask = async (id) => {
  const task = tasks.value.find(t => t.id === id)
  if (!task) return
  if (!confirm(`确定要删除任务「${task.name}」吗？\n\n此操作不可恢复！`)) return
  try {
    const res = await api.delete(`/task/${id}`)
    if (res.success) {
      await loadTasks()
    } else {
      alert('删除失败')
    }
  } catch (e) {
    console.error('删除失败:', e)
    alert('删除失败')
  }
}

const loadTasks = async () => {
  if (!authStore.family?.id) return
  loading.value = true
  try {
    const res = await api.get(`/task/family/${authStore.family.id}`)
    if (res.success) {
      tasks.value = res.tasks || []
    }
  } catch (e) {
    console.error('获取任务失败', e)
  } finally {
    loading.value = false
  }
}

const getRepeatText = (task) => {
  const ruleMap = {
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    custom: `自定义${task.custom_days}天`
  }
  return ruleMap[task.repeat_rule] || '每天'
}

const getRepeatLabel = (rule) => {
  const map = { daily: '每天', weekly: '每周', monthly: '每月' }
  return map[rule] || '每天'
}

onMounted(() => {
  loadTasks()
})
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card h3 {
  margin-bottom: 16px;
  font-size: 16px;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.count-badge {
  font-size: 12px;
  color: var(--text-light);
  background: #F5F5F5;
  padding: 4px 8px;
  border-radius: 10px;
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-manage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #F5F5F5;
}

.task-manage-item:last-child {
  border-bottom: none;
}

.task-main {
  flex: 1;
}

.task-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.btn-danger {
  background: #FFF0F0;
  color: #FF3B30;
  border: 1px solid #FFDAD6;
}

.btn-danger:hover {
  background: #FFDAD6;
}

.task-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.task-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.reward {
  font-weight: 600;
  color: var(--primary);
}

.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.tag-sm {
  font-size: 11px;
  padding: 1px 6px;
}

.tag-sky { background: #E3F2FD; color: #1976D2; }
.tag-gold { background: #FFF8E1; color: #F57C00; }
.tag-orange { background: #FFF3E0; color: #E65100; }
.tag-red { background: #FFEBEE; color: #E53935; }
.tag-warn { background: #FFF3E0; color: #FF9800; }

.bad-habit-section {
  border-left: 4px solid #FF6B6B;
}

.bad-habit-item {
  background: #FFF8F8;
}

.reward.penalty {
  color: #E53935 !important;
}

/* 弹窗 */
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

.modal-xl {
  max-width: 520px;
  max-height: 85vh;
}

.modal-lg {
  max-width: 500px;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
}

/* 模板选择 */
.template-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.template-card {
  background: #F8F8F8;
  border: 2px solid transparent;
  border-radius: var(--radius);
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.template-card:hover {
  background: #F0F0F0;
}

.template-card.selected {
  border-color: var(--primary);
  background: var(--primary-light);
}

.template-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.template-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.template-count {
  font-size: 12px;
  color: #888;
}

.template-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 快速批量设置 */
.quick-batch {
  background: #F5F5F5;
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 16px;
}

/* 标题行 */
.modal-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-title-actions {
  display: flex;
  gap: 8px;
}

/* 任务复选框 */
.task-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  margin-right: 8px;
  flex-shrink: 0;
}

.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.batch-row:last-child {
  margin-bottom: 0;
}

.batch-row span {
  font-size: 13px;
  color: var(--text-light);
  min-width: 60px;
}

.batch-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.batch-buttons .btn {
  padding: 6px 10px;
  border: 1px solid #E0E0E0;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.batch-buttons .btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* 任务编辑列表 */
.task-edit-list {
  max-height: 400px;
  overflow-y: auto;
}

.task-edit-item {
  border: 1px solid #E8E8E8;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  overflow: hidden;
}

.task-edit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #FAFAFA;
  cursor: pointer;
}

.task-edit-header:hover {
  background: #F0F0F0;
}

.task-name-input {
  flex: 1;
  min-width: 0;
}

.task-edit-summary {
  display: flex;
  align-items: center;
  gap: 6px;
}

.delete-icon {
  font-size: 16px;
  font-weight: bold;
  color: #e74c3c;
  cursor: pointer;
  line-height: 1;
}

.delete-icon:hover {
  opacity: 0.7;
}

.expand-icon {
  font-size: 10px;
  color: #999;
}

.task-edit-detail {
  padding: 16px;
  background: white;
  border-top: 1px solid #E8E8E8;
}

.detail-row {
  margin-bottom: 12px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-row > label {
  display: block;
  font-size: 12px;
  color: var(--text-light);
  margin-bottom: 6px;
}

.type-selector, .repeat-selector, .valid-selector {
  display: flex;
  gap: 6px;
}

.type-selector button, .repeat-selector button, .valid-selector button {
  padding: 8px 12px;
  border: 1px solid #E0E0E0;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.type-selector button.active, .repeat-selector button.active, .valid-selector button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.target-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-selector .text {
  font-size: 13px;
  color: var(--text-light);
}

.mode-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-selector label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}

.reward-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-sm {
  width: 50px;
  text-align: center;
  padding: 6px;
}

.remove-btn {
  margin-top: 12px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-actions .btn {
  flex: 1;
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

.mode-hint {
  font-size: 12px;
  color: #999;
  line-height: 1.5;
  margin: 8px 0 0;
}
</style>
