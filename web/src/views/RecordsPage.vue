<template>
  <div class="page">
    <div class="header">
      <h1>📊 我的记录</h1>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">{{ cur[0] }}</div>
        <div class="stat-value">{{ authStore.member?.current_stickers || 0 }}</div>
        <div class="stat-label">当前贴纸</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-value">{{ authStore.member?.total_stickers || 0 }}</div>
        <div class="stat-label">累计获得</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">{{ cur[1] }}</div>
        <div class="stat-value">{{ authStore.member?.current_balls || 0 }}</div>
        <div class="stat-label">粉球</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">{{ authStore.member?.total_balls || 0 }}</div>
        <div class="stat-label">累计粉球</div>
      </div>
    </div>

    <!-- 打卡热力图 -->
    <div class="card">
      <div class="section-header">
        <h3>🔥 打卡热力图</h3>
        <select v-model="heatmapDays" @change="loadHeatmap" class="period-select">
          <option :value="30">近30天</option>
          <option :value="90">近90天</option>
          <option :value="180">近半年</option>
        </select>
      </div>
      <div v-if="heatmapData.length > 0">
        <div class="heatmap-grid">
          <div class="heatmap-weeks">
            <div v-for="(week, wi) in heatmapWeeks" :key="wi" class="heatmap-week">
              <div
                v-for="(day, di) in week"
                :key="day.date || ('empty-' + wi + '-' + di)"
                class="heatmap-cell"
                :class="getHeatmapLevel(day.count)"
                :title="day.date ? `${day.date}：${day.count}次` : ''"
              ></div>
            </div>
          </div>
          <div class="heatmap-legend">
            <span>少</span>
            <div class="heatmap-cell level-0"></div>
            <div class="heatmap-cell level-1"></div>
            <div class="heatmap-cell level-2"></div>
            <div class="heatmap-cell level-3"></div>
            <div class="heatmap-cell level-4"></div>
            <span>多</span>
          </div>
        </div>
        <div class="heatmap-summary" v-if="heatmapSummary">
          <span>{{ heatmapSummary.activeDays }} 天活跃</span>
          <span>共 {{ heatmapSummary.totalCompletions }} 次完成</span>
          <span>日均 {{ heatmapSummary.avgPerDay }} 次</span>
        </div>
      </div>
      <div v-else class="empty-state" style="padding: 20px">
        <p>暂无打卡数据</p>
      </div>
    </div>

    <!-- 月度报告 -->
    <div class="card">
      <div class="section-header">
        <h3>📋 月度报告</h3>
        <div class="month-picker">
          <button class="btn btn-sm" @click="prevMonth">‹</button>
          <span class="month-label">{{ reportYear }}年{{ reportMonth }}月</span>
          <button class="btn btn-sm" @click="nextMonth">›</button>
        </div>
      </div>

      <div v-if="monthlyReport">
        <!-- 贴纸收支 -->
        <div class="report-section">
          <h4>{{ cur[0] }} 贴纸收支</h4>
          <div class="report-grid">
            <div class="report-item positive">
              <div class="report-label">获得</div>
              <div class="report-value">+{{ monthlyReport.sticker.earned }}</div>
            </div>
            <div class="report-item negative">
              <div class="report-label">扣减</div>
              <div class="report-value">-{{ monthlyReport.sticker.penalty }}</div>
            </div>
            <div class="report-item subsidy">
              <div class="report-label">补贴</div>
              <div class="report-value">+{{ monthlyReport.sticker.subsidy }}</div>
            </div>
            <div class="report-item net">
              <div class="report-label">净增</div>
              <div class="report-value">{{ monthlyReport.sticker.net >= 0 ? '+' : '' }}{{ monthlyReport.sticker.net }}</div>
            </div>
          </div>
        </div>

        <!-- 粉球 -->
        <div class="report-section">
          <h4>{{ cur[1] }} 粉球</h4>
          <div class="report-grid">
            <div class="report-item positive">
              <div class="report-label">转换</div>
              <div class="report-value">+{{ monthlyReport.ball.converted }}</div>
            </div>
            <div class="report-item negative">
              <div class="report-label">使用</div>
              <div class="report-value">{{ monthlyReport.ball.used }}</div>
            </div>
          </div>
        </div>

        <!-- 任务完成 -->
        <div class="report-section">
          <h4>✅ 任务完成</h4>
          <div class="report-grid">
            <div class="report-item">
              <div class="report-label">总次数</div>
              <div class="report-value">{{ monthlyReport.tasks.totalCompletions }}</div>
            </div>
            <div class="report-item">
              <div class="report-label">任务数</div>
              <div class="report-value">{{ monthlyReport.tasks.uniqueTasks }}</div>
            </div>
            <div class="report-item">
              <div class="report-label">活跃天</div>
              <div class="report-value">{{ monthlyReport.tasks.activeDays }}</div>
            </div>
          </div>
        </div>

        <!-- 分类统计 -->
        <div class="report-section" v-if="monthlyReport.tasks.categoryStats.length > 0">
          <h4>📊 分类完成</h4>
          <div class="category-list">
            <div v-for="cat in monthlyReport.tasks.categoryStats" :key="cat.category" class="category-item">
              <span class="cat-name">{{ getCategoryName(cat.category) }}</span>
              <div class="cat-bar-bg">
                <div class="cat-bar" :style="{ width: getCategoryWidth(cat.completions) + '%' }"></div>
              </div>
              <span class="cat-count">{{ cat.completions }}次</span>
            </div>
          </div>
        </div>

        <!-- Top任务 -->
        <div class="report-section" v-if="monthlyReport.tasks.topTasks.length > 0">
          <h4>🏆 Top任务</h4>
          <div class="top-task-list">
            <div v-for="(task, idx) in monthlyReport.tasks.topTasks" :key="task.name" class="top-task-item">
              <span class="rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
              <span class="task-name">{{ task.name }}</span>
              <span class="task-cat">{{ getCategoryName(task.category) }}</span>
              <span class="task-count">{{ task.completions }}次</span>
            </div>
          </div>
        </div>

        <!-- 抽卡 -->
        <div class="report-section" v-if="monthlyReport.gacha.totalPulls > 0">
          <h4>🎰 抽卡统计</h4>
          <div class="report-grid">
            <div class="report-item">
              <div class="report-label">总抽卡</div>
              <div class="report-value">{{ monthlyReport.gacha.totalPulls }}次</div>
            </div>
            <div class="report-item">
              <div class="report-label">不同奖励</div>
              <div class="report-value">{{ monthlyReport.gacha.uniqueRewards }}种</div>
            </div>
            <div class="report-item guaranteed">
              <div class="report-label">保底次数</div>
              <div class="report-value">{{ monthlyReport.gacha.guaranteedCount }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state" style="padding: 20px">
        <p>暂无数据</p>
      </div>
    </div>

    <!-- 月度趋势 -->
    <div class="card">
      <h3>📈 月度趋势</h3>
      <div v-if="monthlyTrend.length > 0">
        <div class="trend-chart">
          <div v-for="(item, idx) in monthlyTrend" :key="idx" class="trend-bar">
            <div class="trend-bar-positive" :style="{ height: getTrendHeight(item.earned + item.subsidy) + '%' }">
              <span class="trend-value" v-if="item.earned + item.subsidy > 0">+{{ item.earned + item.subsidy }}</span>
            </div>
            <div class="trend-bar-negative" :style="{ height: getTrendHeight(item.penalty) + '%' }" v-if="item.penalty > 0">
              <span class="trend-value">-{{ item.penalty }}</span>
            </div>
            <div class="trend-label">{{ formatMonth(item.month) }}</div>
            <div class="trend-net" :class="{ positive: item.net >= 0, negative: item.net < 0 }">
              净{{ item.net >= 0 ? '+' : '' }}{{ item.net }}
            </div>
          </div>
        </div>
        <div class="trend-legend">
          <span class="legend-item"><span class="legend-color positive"></span>获得</span>
          <span class="legend-item"><span class="legend-color negative"></span>扣减</span>
        </div>
      </div>
      <div v-else class="empty-state" style="padding: 20px">
        <p>暂无数据</p>
      </div>
    </div>

    <!-- 任务排行（原有，保留） -->
    <div class="card">
      <h3>🏆 任务完成排行</h3>
      <div v-if="taskStats.length > 0">
        <div v-for="(task, index) in taskStats" :key="task.name" class="rank-item">
          <span class="rank-num">{{ index + 1 }}</span>
          <span class="rank-name">{{ task.name }}</span>
          <span class="rank-count">{{ task.completions }}次</span>
        </div>
      </div>
      <div v-else class="empty-state" style="padding: 20px">
        <p>暂无数据</p>
      </div>
    </div>

    <!-- 收支明细 -->
    <div class="card">
      <h3>📜 收支明细</h3>
      <div v-if="logs.length === 0" class="empty-state" style="padding: 20px">
        <p>暂无记录</p>
      </div>
      <div v-else>
        <div v-for="log in logs" :key="log.id" class="log-item">
          <div class="log-info">
            <span class="log-type" :class="log.change_type">
              {{ getLogTypeName(log.change_type) }}
            </span>
            <span class="log-task" v-if="log.task_name">{{ log.task_name }}</span>
            <span class="log-remark" v-else-if="log.remark">{{ log.remark }}</span>
          </div>
          <div class="log-change" :class="log.change_type">
            {{ formatLogChange(log) }}
          </div>
          <div class="log-balance">
            余额: {{ log.balance_after }}
          </div>
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
const cur = computed(() => themeCurrencies())
const logs = ref([])
const taskStats = ref([])

// 热力图
const heatmapData = ref([])
const heatmapDays = ref(90)
const heatmapSummary = ref(null)

// 月度报告
const now = new Date()
const reportYear = ref(now.getFullYear())
const reportMonth = ref(now.getMonth() + 1)
const monthlyReport = ref(null)

// 月度趋势
const monthlyTrend = ref([])

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const formatMonth = (monthStr) => {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  return `${parts[1]}月`
}

const getLogTypeName = (type) => {
  const map = {
    earn: '获得',
    penalty: '扣减',
    convert: '转换',
    adjust: '调整',
    subsidy: '补贴'
  }
  return map[type] || type
}

// 流水金额显示：penalty 流水记的是正数扣减额，convert 流水本身为负数
const formatLogChange = (log) => {
  if (log.change_type === 'penalty') return `-${Math.abs(log.sticker_change)}`
  return `${log.sticker_change > 0 ? '+' : ''}${log.sticker_change}`
}

const getCategoryName = (category) => {
  const map = {
    habit: '好习惯',
    bad_habit: '坏习惯',
    temporary: '待办'
  }
  return map[category] || category
}

// 热力图：按周分组（7天一列）
const heatmapWeeks = computed(() => {
  if (heatmapData.value.length === 0) return []
  // 构建日期到数据的映射
  const dataMap = {}
  heatmapData.value.forEach(d => {
    dataMap[d.date] = d.completionCount
  })

  // 生成完整的日期范围（包含开头补齐到周日）
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - heatmapDays.value + 1)
  // 补齐到周日开始
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1)
  }

  const weeks = []
  let currentWeek = []
  const cursor = new Date(startDate)
  while (cursor <= today) {
    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    currentWeek.push({
      date: dateStr,
      count: dataMap[dateStr] || 0
    })
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }
  return weeks
})

const getHeatmapLevel = (count) => {
  if (!count || count === 0) return 'level-0'
  if (count <= 2) return 'level-1'
  if (count <= 4) return 'level-2'
  if (count <= 6) return 'level-3'
  return 'level-4'
}

const getCategoryWidth = (count) => {
  if (!monthlyReport.value) return 0
  const max = Math.max(...monthlyReport.value.tasks.categoryStats.map(c => c.completions), 1)
  return (count / max) * 100
}

const getTrendHeight = (value) => {
  if (!value || value === 0) return 0
  const max = Math.max(...monthlyTrend.value.flatMap(t => [t.earned + t.subsidy, t.penalty]), 1)
  return Math.max(10, (value / max) * 100)
}

const prevMonth = () => {
  if (reportMonth.value === 1) {
    reportMonth.value = 12
    reportYear.value--
  } else {
    reportMonth.value--
  }
  loadMonthlyReport()
}

const nextMonth = () => {
  const nowDate = new Date()
  if (reportYear.value === nowDate.getFullYear() && reportMonth.value === nowDate.getMonth() + 1) return
  if (reportMonth.value === 12) {
    reportMonth.value = 1
    reportYear.value++
  } else {
    reportMonth.value++
  }
  loadMonthlyReport()
}

const loadHeatmap = async () => {
  if (!authStore.member?.id) return
  try {
    const res = await api.get(`/stats/heatmap/${authStore.member.id}`, {
      params: { days: heatmapDays.value }
    })
    if (res.success) {
      heatmapData.value = res.heatmap || []
      heatmapSummary.value = res.summary
    }
  } catch (e) {
    console.error('获取热力图失败', e)
  }
}

const loadMonthlyReport = async () => {
  if (!authStore.member?.id) return
  try {
    const res = await api.get(`/stats/monthly-report/${authStore.member.id}`, {
      params: { year: reportYear.value, month: reportMonth.value }
    })
    if (res.success) {
      monthlyReport.value = res
    }
  } catch (e) {
    console.error('获取月度报告失败', e)
  }
}

const loadMonthlyTrend = async () => {
  if (!authStore.member?.id) return
  try {
    const res = await api.get(`/stats/trend/${authStore.member.id}`, {
      params: { months: 6 }
    })
    if (res.success) {
      monthlyTrend.value = res.trend || []
    }
  } catch (e) {
    console.error('获取月度趋势失败', e)
  }
}

const loadStats = async () => {
  if (!authStore.member?.id) return
  try {
    const [statsRes, logsRes] = await Promise.all([
      api.get(`/sticker/stats/${authStore.member.id}`, { params: { period: 'week' } }),
      api.get(`/sticker/logs/${authStore.member.id}`, { params: { limit: 30 } })
    ])

    if (statsRes.success) {
      taskStats.value = statsRes.taskStats || []
    }

    if (logsRes.success) {
      logs.value = logsRes.logs || []
    }
  } catch (e) {
    console.error('获取统计失败', e)
  }
}

onMounted(() => {
  loadStats()
  loadHeatmap()
  loadMonthlyReport()
  loadMonthlyTrend()
})
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  border-radius: var(--radius);
  padding: 16px;
  text-align: center;
  box-shadow: var(--shadow);
}

.stat-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-light);
}

.card h3 {
  margin-bottom: 16px;
  font-size: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin-bottom: 0;
}

.period-select {
  padding: 6px 10px;
  border: 1px solid #E0E0E0;
  border-radius: var(--radius-sm);
  background: white;
  font-size: 13px;
}

/* 热力图 */
.heatmap-grid {
  overflow-x: auto;
  padding-bottom: 8px;
}

.heatmap-weeks {
  display: flex;
  gap: 3px;
  min-width: max-content;
}

.heatmap-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.heatmap-cell {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: #EBEDF0;
}

.heatmap-cell.level-0 { background: #EBEDF0; }
.heatmap-cell.level-1 { background: #C6E48B; }
.heatmap-cell.level-2 { background: #7BC96F; }
.heatmap-cell.level-3 { background: #239A3B; }
.heatmap-cell.level-4 { background: #196127; }

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-light);
}

.heatmap-legend .heatmap-cell {
  width: 12px;
  height: 12px;
}

.heatmap-summary {
  display: flex;
  justify-content: space-around;
  margin-top: 12px;
  padding: 10px;
  background: #F8F9FA;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
}

/* 月度报告 */
.month-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-label {
  font-size: 14px;
  font-weight: 600;
  min-width: 100px;
  text-align: center;
}

.report-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #F0F0F0;
}

.report-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.report-section h4 {
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--text);
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.report-item {
  text-align: center;
  padding: 10px 4px;
  background: #F8F9FA;
  border-radius: var(--radius-sm);
}

.report-item.positive { background: #E8F5E9; }
.report-item.negative { background: #FFEBEE; }
.report-item.subsidy { background: #E3F2FD; }
.report-item.net { background: linear-gradient(135deg, #FFF3E0, #FFE0B2); }
.report-item.guaranteed { background: #F3E5F5; }

.report-label {
  font-size: 11px;
  color: var(--text-light);
  margin-bottom: 4px;
}

.report-value {
  font-size: 16px;
  font-weight: 700;
}

.report-item.positive .report-value { color: #4CAF50; }
.report-item.negative .report-value { color: #E53935; }
.report-item.subsidy .report-value { color: #2196F3; }
.report-item.net .report-value { color: #FF9800; }
.report-item.guaranteed .report-value { color: #9C27B0; }

/* 分类统计 */
.category-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.cat-name {
  min-width: 60px;
  color: var(--text-light);
}

.cat-bar-bg {
  flex: 1;
  height: 12px;
  background: #F0F0F0;
  border-radius: 6px;
  overflow: hidden;
}

.cat-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-light));
  border-radius: 6px;
  transition: width 0.3s;
}

.cat-count {
  min-width: 50px;
  text-align: right;
  font-weight: 600;
}

/* Top任务 */
.top-task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.top-task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #FAFAFA;
  border-radius: var(--radius-sm);
}

.rank {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.rank-1 { background: #FFD700; }
.rank-2 { background: #C0C0C0; }
.rank-3 { background: #CD7F32; }
.rank:not(.rank-1):not(.rank-2):not(.rank-3) { background: #BBB; }

.top-task-item .task-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.top-task-item .task-cat {
  font-size: 11px;
  color: var(--text-light);
  padding: 2px 6px;
  background: #F0F0F0;
  border-radius: 8px;
}

.top-task-item .task-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
}

/* 月度趋势 */
.trend-chart {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  height: 160px;
  padding: 10px 0;
  gap: 8px;
}

.trend-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.trend-bar-positive {
  width: 100%;
  max-width: 24px;
  background: linear-gradient(180deg, #4CAF50, #81C784);
  border-radius: 4px 4px 0 0;
  display: flex;
  justify-content: center;
  min-height: 2px;
}

.trend-bar-negative {
  width: 100%;
  max-width: 24px;
  background: linear-gradient(180deg, #E53935, #EF5350);
  border-radius: 0 0 4px 4px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  min-height: 2px;
}

.trend-value {
  font-size: 9px;
  color: white;
  padding: 2px;
}

.trend-label {
  font-size: 11px;
  color: var(--text-light);
  margin-top: 4px;
}

.trend-net {
  font-size: 10px;
  font-weight: 600;
  margin-top: 2px;
}

.trend-net.positive { color: #4CAF50; }
.trend-net.negative { color: #E53935; }

.trend-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-light);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.positive { background: #4CAF50; }
.legend-color.negative { background: #E53935; }

/* 任务排行 */
.rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.rank-item:last-child {
  border-bottom: none;
}

.rank-num {
  width: 24px;
  height: 24px;
  background: var(--secondary);
  color: var(--text);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  margin-right: 12px;
}

.rank-name {
  flex: 1;
}

.rank-count {
  color: var(--text-light);
  font-size: 14px;
}

/* 收支明细 */
.log-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.log-item:last-child {
  border-bottom: none;
}

.log-info {
  flex: 1;
}

.log-type {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  margin-right: 8px;
}

.log-type.earn { background: #E8F5E9; color: #4CAF50; }
.log-type.penalty { background: #FFEBEE; color: #F44336; }
.log-type.adjust { background: #E3F2FD; color: #2196F3; }
.log-type.subsidy { background: #FFF3E0; color: #FF9800; }
.log-type.convert { background: #F3E5F5; color: #9C27B0; }

.log-task, .log-remark {
  font-size: 14px;
  color: var(--text-light);
}

.log-change {
  font-weight: 700;
  margin-right: 12px;
}

.log-change.earn { color: var(--accent); }
.log-change.penalty { color: #FF6B6B; }
.log-change.adjust { color: var(--sky); }
.log-change.subsidy { color: #FF9800; }
.log-change.convert { color: #9C27B0; }

.log-balance {
  font-size: 12px;
  color: var(--text-light);
}
</style>
