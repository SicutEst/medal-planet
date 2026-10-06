<template>
  <div class="page">
    <div class="header">
      <h1>🎁 奖励商店</h1>
      <button v-if="authStore.isParent" class="btn btn-sm btn-secondary header-btn" @click="showAddModal = true">
        + 添加
      </button>
    </div>

    <!-- 粉球余额 -->
    <div class="ball-card">
      <div class="ball-icon">{{ cur[1] }}</div>
      <div class="ball-value">{{ authStore.member?.current_balls || 0 }}</div>
      <div class="ball-label">当前粉球</div>
    </div>

    <!-- 标签切换 -->
    <div class="filter-tabs">
      <button :class="{ active: tab === 'exchange' }" @click="tab = 'exchange'">直兑区</button>
      <button :class="{ active: tab === 'gacha' }" @click="tab = 'gacha'">抽卡区</button>
      <button :class="{ active: tab === 'pets' }" @click="tab = 'pets'">🐾 宠物</button>
      <button :class="{ active: tab === 'history' }" @click="tab = 'history'">记录</button>
    </div>

    <!-- 直兑区 -->
    <div v-if="tab === 'exchange'">
      <div v-if="exchangeRewards.length === 0" class="card empty-state">
        <div class="icon">🎁</div>
        <p>暂无可兑换奖励</p>
        <p v-if="authStore.isParent" style="font-size: 13px; margin-top: 8px">点击右上角添加奖励</p>
      </div>
      <div v-else>
        <div v-for="reward in exchangeRewards" :key="reward.id" class="reward-card">
          <div class="reward-icon">{{ reward.icon || '🎁' }}</div>
          <div class="reward-info">
            <div class="reward-name">{{ reward.name }}</div>
            <div class="reward-desc" v-if="reward.description">{{ reward.description }}</div>
            <div class="reward-tags">
              <span class="tag" :class="getTierClass(reward.tier)">{{ reward.tier }}</span>
              <span v-if="reward.stock > 0" class="tag tag-stock">库存 {{ reward.stock }}</span>
              <span v-else-if="reward.stock === -1" class="tag tag-unlimited">无限</span>
              <span v-else class="tag tag-soldout">已兑完</span>
            </div>
          </div>
          <div class="reward-action">
            <div class="reward-cost">{{ reward.required_balls }} {{ cur[1] }}</div>
            <button
              v-if="!authStore.isParent"
              class="btn btn-primary btn-sm"
              :disabled="!canExchange(reward)"
              @click="exchangeReward(reward)"
            >
              兑换
            </button>
            <div v-else class="parent-actions">
              <button class="btn btn-sm" @click="editReward(reward)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteReward(reward)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 抽卡区 -->
    <div v-if="tab === 'gacha'">
      <div class="card gacha-info-card">
        <div class="gacha-title">🎰 抽卡奖励池</div>
        <div class="gacha-info">
          <p>每 10 粉球可抽取一次</p>
          <p>每 90 抽保底五星奖励</p>
        </div>
        <!-- 保底进度 -->
        <div v-if="!authStore.isParent && pityInfo" class="pity-bar">
          <div class="pity-label">保底进度</div>
          <div class="pity-progress">
            <div class="pity-fill" :style="{ width: (pityInfo.pityCounter / pityInfo.pityThreshold * 100) + '%' }"></div>
          </div>
          <div class="pity-text">
            {{ pityInfo.pityCounter }} / {{ pityInfo.pityThreshold }} （再抽 {{ pityInfo.remaining }} 次必出五星）
          </div>
        </div>
        <div class="gacha-buttons" v-if="!authStore.isParent">
          <button class="btn btn-primary" @click="doGacha(1)" :disabled="gachaLoading || (authStore.member?.current_balls || 0) < 10">
            {{ gachaLoading ? '抽取中...' : '单抽 (10' + cur[1] + ')' }}
          </button>
          <button class="btn btn-secondary" @click="doGacha(10)" :disabled="gachaLoading || (authStore.member?.current_balls || 0) < 100">
            {{ gachaLoading ? '抽取中...' : '十连 (100' + cur[1] + ')' }}
          </button>
        </div>
        <div class="gacha-hint">💡 粉球通过累计贴纸获得，每 160 贴纸 = 1 粉球</div>
      </div>

      <div v-if="gachaRewards.length === 0" class="card empty-state">
        <div class="icon">🎰</div>
        <p>抽卡奖励池暂无奖励</p>
        <p v-if="authStore.isParent" style="font-size: 13px; margin-top: 8px">添加奖励时勾选"加入抽卡池"</p>
      </div>
      <div v-else>
        <h3 class="pool-title">📋 奖池列表</h3>
        <div v-for="reward in gachaRewards" :key="reward.id" class="reward-card gacha-reward-card">
          <div class="reward-icon">{{ reward.icon || '🎁' }}</div>
          <div class="reward-info">
            <div class="reward-name">{{ reward.name }}</div>
            <div class="reward-tags">
              <span class="tag" :class="getTierClass(reward.tier)">{{ reward.tier }}</span>
            </div>
          </div>
          <div v-if="authStore.isParent" class="parent-actions">
            <button class="btn btn-sm" @click="editReward(reward)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteReward(reward)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 兑换记录 -->
    <div v-if="tab === 'history'">
      <div v-if="exchanges.length === 0" class="card empty-state">
        <div class="icon">📜</div>
        <p>暂无兑换记录</p>
      </div>
      <div v-else>
        <div v-for="ex in exchanges" :key="ex.id" class="exchange-item">
          <div class="exchange-icon">{{ ex.reward_icon || '🎁' }}</div>
          <div class="exchange-info">
            <div class="exchange-name">{{ ex.reward_name }}</div>
            <div v-if="ex.member_name" class="exchange-member">{{ ex.member_name }}</div>
            <div class="exchange-time">{{ formatTime(ex.created_at) }}</div>
          </div>
          <div class="exchange-right">
            <div class="exchange-cost">-{{ ex.cost_balls }} {{ cur[1] }}</div>
            <span class="status-badge" :class="ex.status">
              {{ ex.status === 'pending' ? '待领取' : ex.status === 'confirmed' ? '已领取' : '已取消' }}
            </span>
            <button
              v-if="authStore.isParent && ex.status === 'pending'"
              class="btn btn-sm btn-primary confirm-btn"
              @click="confirmExchange(ex)"
            >确认领取</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 宠物收藏 -->
    <div v-if="tab === 'pets'">
      <div class="pets-summary" v-if="pets.length > 0">
        <div class="pets-stat">
          <span class="stat-num">{{ pets.length }}</span>
          <span class="stat-label">种宠物</span>
        </div>
        <div class="pets-stat">
          <span class="stat-num">{{ pets.reduce((s, p) => s + (p.count || 0), 0) }}</span>
          <span class="stat-label">总数</span>
        </div>
        <div class="pets-stat">
          <span class="stat-num">{{ pets.filter(p => p.reward_tier === '五星').length }}</span>
          <span class="stat-label">五星</span>
        </div>
      </div>
      <div v-if="pets.length === 0" class="card empty-state">
        <div class="icon">🐾</div>
        <p>还没有宠物，去抽卡区抽取吧！</p>
      </div>
      <div v-else class="pets-grid">
        <div v-for="pet in pets" :key="pet.id" class="pet-card" :class="getTierClass(pet.reward_tier)">
          <div class="pet-icon">{{ pet.reward_icon || '🎁' }}</div>
          <div class="pet-name">{{ pet.reward_name }}</div>
          <div class="pet-tier">{{ pet.reward_tier }}</div>
          <div class="pet-count" v-if="pet.count > 1">×{{ pet.count }}</div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑奖励弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal" @click.stop>
        <div class="modal-title">{{ editingReward ? '编辑奖励' : '添加奖励' }}</div>

        <div class="form-group">
          <label>图标</label>
          <div class="icon-picker">
            <button
              v-for="ic in icons"
              :key="ic"
              :class="['icon-btn', { selected: rewardForm.icon === ic }]"
              @click="rewardForm.icon = ic"
            >{{ ic }}</button>
          </div>
        </div>

        <div class="form-group">
          <label>奖励名称</label>
          <input v-model="rewardForm.name" type="text" class="input" placeholder="如：冰淇淋">
        </div>

        <div class="form-group">
          <label>描述（可选）</label>
          <input v-model="rewardForm.description" type="text" class="input" placeholder="奖励描述">
        </div>

        <div class="form-group">
          <label>稀有度</label>
          <div class="tier-selector">
            <button
              v-for="t in tiers"
              :key="t"
              :class="['tier-btn', getTierClass(t), { active: rewardForm.tier === t }]"
              @click="rewardForm.tier = t"
            >{{ t }}</button>
          </div>
        </div>

        <div class="form-group">
          <label>所需粉球</label>
          <div class="amount-input">
            <button @click="rewardForm.requiredBalls = Math.max(1, rewardForm.requiredBalls - 1)" class="btn btn-sm">-</button>
            <input v-model.number="rewardForm.requiredBalls" type="number" class="input" style="width: 80px; text-align: center" min="1">
            <button @click="rewardForm.requiredBalls++" class="btn btn-sm">+</button>
          </div>
        </div>

        <div class="form-group">
          <label>库存数量（-1为无限）</label>
          <div class="amount-input">
            <button @click="rewardForm.stock = rewardForm.stock === -1 ? 1 : Math.max(-1, rewardForm.stock - 1)" class="btn btn-sm">-</button>
            <input v-model.number="rewardForm.stock" type="number" class="input" style="width: 80px; text-align: center">
            <button @click="rewardForm.stock = rewardForm.stock === -1 ? 1 : rewardForm.stock + 1" class="btn btn-sm">+</button>
          </div>
        </div>

        <div class="form-group">
          <label>类型</label>
          <div class="type-checkboxes">
            <label class="checkbox-label">
              <input type="checkbox" v-model="rewardForm.isExchangeable">
              可直接兑换
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="rewardForm.isGachaPool">
              加入抽卡池
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeAddModal">取消</button>
          <button class="btn btn-primary" @click="saveReward" :disabled="!rewardForm.name">
            {{ editingReward ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 抽卡结果弹窗 -->
    <div v-if="showGachaResult" class="modal-overlay" @click="showGachaResult = false">
      <div class="modal gacha-result" @click.stop>
        <div class="result-title">
          {{ gachaResults.length > 1 ? `✨ 十连抽卡结果（${gachaResults.length}个）` : '✨ 抽中奖励' }}
        </div>
        <div v-if="gachaResults.length === 1" class="single-result">
          <div class="result-icon" :class="{ 'guaranteed-glow': gachaResults[0].isGuaranteed }">{{ gachaResults[0].icon || '🎁' }}</div>
          <div class="result-reward">{{ gachaResults[0].name }}</div>
          <div class="result-tier" :class="getTierClass(gachaResults[0].tier)">
            {{ gachaResults[0].tier || '普通' }}
            <span v-if="gachaResults[0].isGuaranteed" class="guaranteed-tag">保底</span>
          </div>
        </div>
        <div v-else class="multi-result">
          <div v-for="(r, idx) in gachaResults" :key="idx" class="multi-item" :class="getTierClass(r.tier)">
            <div class="multi-icon">{{ r.icon || '🎁' }}</div>
            <div class="multi-name">{{ r.name }}</div>
            <div class="multi-tier">{{ r.tier }}</div>
            <span v-if="r.isGuaranteed" class="guaranteed-tag">保底</span>
          </div>
        </div>
        <button class="btn btn-primary" @click="showGachaResult = false">太棒了！</button>
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
const tab = ref('exchange')
const rewards = ref([])
const exchanges = ref([])
const pets = ref([])
const pityInfo = ref(null)
const showAddModal = ref(false)
const showGachaResult = ref(false)
const editingReward = ref(null)
const gachaResults = ref([])
const gachaLoading = ref(false)

const icons = ['🎁', '🍦', '🎮', '📖', '🍕', '🎯', '🎪', '🎨', '🚗', '⭐', '🏆', '🎈']
const tiers = ['普通', '三星', '四星', '五星']

const rewardForm = ref({
  name: '',
  description: '',
  tier: '普通',
  requiredBalls: 10,
  stock: -1,
  icon: '🎁',
  isExchangeable: true,
  isGachaPool: false
})

const exchangeRewards = computed(() => rewards.value.filter(r => r.is_exchangeable))
const gachaRewards = computed(() => rewards.value.filter(r => r.is_gacha_pool))

const getTierClass = (tier) => {
  const map = { '五星': 'tier-star', '四星': 'tier-purple', '三星': 'tier-sky', '普通': 'tier-green' }
  return map[tier] || 'tier-green'
}

const canExchange = (reward) => {
  if (reward.stock === 0) return false
  return (authStore.member?.current_balls || 0) >= reward.required_balls
}

const formatTime = (time) => {
  if (!time) return ''
  const d = new Date(time)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const loadRewards = async () => {
  if (!authStore.family?.id) return
  try {
    const res = await api.get(`/reward/family/${authStore.family.id}`)
    if (res.success) {
      rewards.value = res.rewards || []
    }
  } catch (e) {
    console.error('获取奖励失败', e)
  }
}

const loadExchanges = async () => {
  if (authStore.isParent) {
    // 家长查看家庭所有兑换记录（用于确认领取）
    if (!authStore.family?.id) return
    try {
      const res = await api.get(`/reward/family-exchanges/${authStore.family.id}`)
      if (res.success) {
        exchanges.value = res.exchanges || []
      }
    } catch (e) {
      console.error('获取兑换记录失败', e)
    }
  } else {
    // 孩子查看自己的兑换记录
    if (!authStore.member?.id) return
    try {
      const res = await api.get(`/reward/exchanges/${authStore.member.id}`)
      if (res.success) {
        exchanges.value = res.exchanges || []
      }
    } catch (e) {
      console.error('获取兑换记录失败', e)
    }
  }
}

const exchangeReward = async (reward) => {
  if (!confirm(`确定兑换「${reward.name}」？\n\n将消耗 ${reward.required_balls} 个粉球`)) return
  try {
    const res = await api.post(`/reward/${reward.id}/exchange`, {
      memberId: authStore.member.id
    })
    if (res.success) {
      alert(`兑换成功！请找家长确认领取~`)
      await authStore.refreshMember()
      await loadRewards()
      await loadExchanges()
    }
  } catch (e) {
    const msg = e.response?.data?.error || '兑换失败'
    alert(msg)
  }
}

const confirmExchange = async (ex) => {
  if (!confirm(`确认「${ex.member_name || ''}」已领取「${ex.reward_name}」？`)) return
  try {
    const res = await api.put(`/reward/exchange/${ex.id}/confirm`)
    if (res.success) {
      await loadExchanges()
    }
  } catch (e) {
    const msg = e.response?.data?.error || '确认失败'
    alert(msg)
  }
}

const editReward = (reward) => {
  editingReward.value = reward
  rewardForm.value = {
    name: reward.name,
    description: reward.description || '',
    tier: reward.tier || '普通',
    requiredBalls: reward.required_balls,
    stock: reward.stock ?? -1,
    icon: reward.icon || '🎁',
    isExchangeable: reward.is_exchangeable,
    isGachaPool: reward.is_gacha_pool
  }
  showAddModal.value = true
}

const closeAddModal = () => {
  showAddModal.value = false
  editingReward.value = null
  rewardForm.value = {
    name: '', description: '', tier: '普通', requiredBalls: 10,
    stock: -1, icon: '🎁', isExchangeable: true, isGachaPool: false
  }
}

const saveReward = async () => {
  if (!rewardForm.value.name) return
  try {
    if (editingReward.value) {
      await api.put(`/reward/${editingReward.value.id}`, rewardForm.value)
    } else {
      await api.post('/reward', {
        ...rewardForm.value,
        familyId: authStore.family.id
      })
    }
    await loadRewards()
    closeAddModal()
  } catch (e) {
    alert('保存失败')
  }
}

const deleteReward = async (reward) => {
  if (!confirm(`确定删除奖励「${reward.name}」？`)) return
  try {
    await api.delete(`/reward/${reward.id}`)
    await loadRewards()
  } catch (e) {
    alert('删除失败')
  }
}

// 真实后端抽卡：扣粉球、保底、记录、宠物收藏
const doGacha = async (count) => {
  if (gachaLoading.value) return
  const cost = count * 10
  if ((authStore.member?.current_balls || 0) < cost) {
    alert('粉球不足')
    return
  }
  gachaLoading.value = true
  try {
    const res = await api.post('/gacha/draw', {
      memberId: authStore.member.id,
      count
    })
    if (res.success) {
      gachaResults.value = res.results || []
      showGachaResult.value = true
      await authStore.refreshMember()
      await loadPity()
      // 抽卡后刷新宠物列表（无论当前在哪个tab，确保切换到宠物页时数据是最新的）
      await loadPets()
    }
  } catch (e) {
    const msg = e.response?.data?.error || '抽卡失败'
    alert(msg)
  } finally {
    gachaLoading.value = false
  }
}

const loadPets = async () => {
  if (!authStore.member?.id) return
  try {
    const res = await api.get(`/gacha/pets/${authStore.member.id}`)
    if (res.success) {
      pets.value = res.pets || []
    }
  } catch (e) {
    console.error('获取宠物收藏失败', e)
  }
}

const loadPity = async () => {
  if (!authStore.member?.id || authStore.isParent) return
  try {
    const res = await api.get(`/gacha/pity/${authStore.member.id}`)
    if (res.success) {
      pityInfo.value = res
    }
  } catch (e) {
    console.error('获取保底进度失败', e)
  }
}

onMounted(() => {
  loadRewards()
  loadExchanges()
  loadPets()
  loadPity()
})
</script>

<style scoped>
.header-btn {
  background: rgba(255,255,255,0.3) !important;
  border: none !important;
  color: white !important;
}

.ball-card {
  background: linear-gradient(135deg, #9B59B6, #8E44AD);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  color: white;
  margin-bottom: 20px;
}

.ball-icon { font-size: 36px; }
.ball-value { font-size: 40px; font-weight: 700; }
.ball-label { opacity: 0.9; }

.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.filter-tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  background: white;
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

/* 奖励卡片 */
.reward-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: var(--radius);
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.reward-icon {
  font-size: 36px;
  width: 48px;
  text-align: center;
  flex-shrink: 0;
}

.reward-info {
  flex: 1;
  min-width: 0;
}

.reward-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.reward-desc {
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 6px;
}

.reward-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.tier-star { background: #FFF3E0; color: #FF9800; }
.tier-purple { background: #F3E5F5; color: #9C27B0; }
.tier-sky { background: #E3F2FD; color: #2196F3; }
.tier-green { background: #E8F5E9; color: #4CAF50; }
.tag-stock { background: #FFF8E1; color: #F57C00; }
.tag-unlimited { background: #E8F5E9; color: #4CAF50; }
.tag-soldout { background: #FFEBEE; color: #E53935; }

.reward-action {
  text-align: center;
  flex-shrink: 0;
}

.reward-cost {
  font-weight: 700;
  color: var(--purple);
  margin-bottom: 6px;
  white-space: nowrap;
}

.parent-actions {
  display: flex;
  gap: 4px;
}

/* 抽卡区 */
.gacha-info-card {
  text-align: center;
  background: linear-gradient(135deg, #F3E5F5, #E1BEE7);
}

.gacha-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

.gacha-info {
  color: var(--text-light);
  margin-bottom: 16px;
}

.gacha-info p {
  margin-bottom: 4px;
}

.gacha-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.gacha-buttons .btn {
  flex: 1;
}

.gacha-hint {
  font-size: 12px;
  color: var(--text-light);
}

.pool-title {
  font-size: 16px;
  margin-bottom: 12px;
}

.gacha-reward-card {
  background: #FAFAFA;
}

/* 兑换记录 */
.exchange-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: white;
  border-radius: var(--radius);
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.exchange-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.exchange-info {
  flex: 1;
}

.exchange-name {
  font-weight: 500;
}

.exchange-member {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 2px;
}

.exchange-time {
  font-size: 12px;
  color: var(--text-light);
}

.exchange-right {
  text-align: right;
}

.exchange-cost {
  font-weight: 700;
  color: var(--purple);
}

.confirm-btn {
  margin-top: 6px;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-top: 4px;
}

.status-badge.pending { background: #FFF3E0; color: #FF9800; }
.status-badge.confirmed { background: #E8F5E9; color: #4CAF50; }
.status-badge.cancelled { background: #FFEBEE; color: #E53935; }

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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
  max-height: 85vh;
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

.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: 2px solid #E8E8E8;
  background: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn.selected {
  border-color: var(--primary);
  background: var(--primary-light);
}

.tier-selector {
  display: flex;
  gap: 6px;
}

.tier-btn {
  flex: 1;
  padding: 8px;
  border: 2px solid #E8E8E8;
  background: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.tier-btn.active {
  border-width: 2px;
  font-weight: 700;
}

.amount-input {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.type-checkboxes {
  display: flex;
  gap: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-actions .btn {
  flex: 1;
}

/* 抽卡结果 */
.gacha-result {
  text-align: center;
}

.result-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.result-icon {
  font-size: 56px;
  margin-bottom: 8px;
}

.result-reward {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 8px;
}

.result-tier {
  display: inline-block;
  padding: 4px 16px;
  border-radius: 20px;
  margin-bottom: 20px;
}

/* 保底进度条 */
.pity-bar {
  background: rgba(255,255,255,0.6);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin-bottom: 16px;
}

.pity-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}

.pity-progress {
  height: 8px;
  background: rgba(0,0,0,0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.pity-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF9800, #FF5722);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.pity-text {
  font-size: 11px;
  color: var(--text-light);
}

/* 宠物收藏 */
.pets-summary {
  display: flex;
  justify-content: space-around;
  background: linear-gradient(135deg, #E1BEE7, #F3E5F5);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.pets-stat {
  text-align: center;
}

.stat-num {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--purple);
}

.stat-label {
  font-size: 12px;
  color: var(--text-light);
}

.pets-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.pet-card {
  background: white;
  border-radius: var(--radius-sm);
  padding: 12px 8px;
  text-align: center;
  position: relative;
  border: 2px solid #E8E8E8;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}

.pet-card.tier-star {
  border-color: #FF9800;
  background: linear-gradient(135deg, #FFF3E0, #FFFFFF);
}

.pet-card.tier-purple {
  border-color: #9C27B0;
}

.pet-card.tier-sky {
  border-color: #2196F3;
}

.pet-icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.pet-name {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
  word-break: break-all;
}

.pet-tier {
  font-size: 10px;
  color: var(--text-light);
}

.pet-count {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--primary);
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

/* 抽卡结果 - 多结果 */
.single-result {
  margin-bottom: 16px;
}

.multi-result {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 16px;
  max-height: 50vh;
  overflow-y: auto;
}

.multi-item {
  background: #FAFAFA;
  border-radius: var(--radius-sm);
  padding: 10px 6px;
  text-align: center;
  position: relative;
  border: 2px solid #E8E8E8;
}

.multi-item.tier-star {
  border-color: #FF9800;
  background: linear-gradient(135deg, #FFF3E0, #FFFFFF);
}

.multi-item.tier-purple {
  border-color: #9C27B0;
}

.multi-item.tier-sky {
  border-color: #2196F3;
}

.multi-icon {
  font-size: 28px;
}

.multi-name {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
  word-break: break-all;
}

.multi-tier {
  font-size: 10px;
  color: var(--text-light);
}

.guaranteed-tag {
  display: inline-block;
  background: #FF5722;
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 4px;
  font-weight: 600;
}

.guaranteed-glow {
  animation: glow 1.5s ease-in-out infinite alternate;
}

@keyframes glow {
  from { filter: drop-shadow(0 0 4px #FF9800); }
  to { filter: drop-shadow(0 0 12px #FF5722); }
}

.btn-danger {
  background: #FFEBEE;
  color: #E53935;
}
</style>
