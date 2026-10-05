<template>
  <div class="page">
    <div class="header">
      <h1>🎰 抽卡中心</h1>
    </div>

    <!-- 粉球余额 -->
    <div class="ball-card">
      <div class="ball-icon">🔮</div>
      <div class="ball-value">{{ authStore.member?.current_balls || 0 }}</div>
      <div class="ball-label">当前粉球</div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div class="progress-text">
        再攒 {{ 90 - (authStore.member?.current_balls || 0) % 90 }} 个可兑换五星奖励
      </div>
    </div>

    <!-- 抽卡区域 -->
    <div class="gacha-area card">
      <div class="gacha-title">🎁 奖励抽卡</div>
      <div class="gacha-info">
        <p>每 10 粉球可抽取一次</p>
        <p>每 90 粉球保底兑换</p>
      </div>

      <div class="gacha-buttons">
        <button class="btn btn-primary" @click="doGacha(1)" :disabled="!canGacha(1)">
          单抽 (1🔮)
        </button>
        <button class="btn btn-secondary" @click="doGacha(10)" :disabled="!canGacha(10)">
          十连 (10🔮)
        </button>
      </div>

      <div class="gacha-hint">
        💡 粉球通过累计贴纸获得，每 160 贴纸 = 1 粉球
      </div>
    </div>

    <!-- 累计兑换 -->
    <div class="card">
      <div class="section-header">
        <h3>🎁 累计兑换</h3>
        <span class="hint">90 粉球保底</span>
      </div>
      
      <div v-if="canExchange" class="exchange-ready">
        <p>🎉 你已攒够 90 粉球！</p>
        <button class="btn btn-primary" style="width: 100%" @click="showExchangeModal = true">
          去兑换
        </button>
      </div>
      <div v-else class="exchange-waiting">
        <p>还差 {{ 90 - ((authStore.member?.current_balls || 0) % 90) || 90 }} 粉球</p>
        <div class="progress-mini">
          <div class="progress-mini-fill" :style="{ width: ((authStore.member?.current_balls || 0) % 90) / 90 * 100 + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 抽卡结果弹窗 -->
    <div v-if="showResult" class="modal-overlay" @click="showResult = false">
      <div class="modal gacha-result" @click.stop>
        <div class="result-title">{{ resultData.isGuaranteed ? '🎊 保底奖励！' : '✨ 抽中奖励' }}</div>
        <div class="result-reward">{{ resultData.reward?.name || '小奖励' }}</div>
        <div class="result-tier" :class="resultData.reward?.tier">
          {{ resultData.reward?.tier || '普通' }}
        </div>
        <button class="btn btn-primary" @click="showResult = false">太棒了！</button>
      </div>
    </div>

    <!-- 兑换弹窗 -->
    <div v-if="showExchangeModal" class="modal-overlay" @click="showExchangeModal = false">
      <div class="modal exchange-modal" @click.stop>
        <div class="modal-title">🎁 累计兑换</div>
        <div class="exchange-info">
          <p>将消耗 90 粉球兑换一个五星奖励</p>
        </div>
        <div class="exchange-rewards">
          <div
            v-for="reward in exchangeRewards"
            :key="reward.id"
            class="reward-item"
            @click="exchangeReward(reward)"
          >
            <div class="reward-name">{{ reward.name }}</div>
            <div class="reward-tier tag" :class="'tag-' + getTierColor(reward.tier)">
              {{ reward.tier }}
            </div>
          </div>
        </div>
        <button class="btn btn-secondary" @click="showExchangeModal = false">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()
const showResult = ref(false)
const showExchangeModal = ref(false)
const resultData = ref({})
const exchangeRewards = ref([
  { id: 1, name: '迪士尼一日游', tier: '五星' },
  { id: 2, name: 'Switch游戏', tier: '五星' },
  { id: 3, name: '500元现金', tier: '五星' },
])

const progressPercent = computed(() => {
  const balls = authStore.member?.current_balls || 0
  return (balls % 90) / 90 * 100
})

const canGacha = (count) => {
  return (authStore.member?.current_balls || 0) >= count
}

const canExchange = computed(() => {
  return (authStore.member?.current_balls || 0) >= 90
})

const getTierColor = (tier) => {
  const colors = {
    '五星': 'star',
    '四星': 'purple',
    '三星': 'sky',
    '普通': 'green'
  }
  return colors[tier] || 'green'
}

const doGacha = async (count) => {
  // 模拟抽卡结果（实际需要后端支持）
  const rewards = [
    { name: '冰淇淋', tier: '普通', probability: 0.5 },
    { name: '小玩具', tier: '普通', probability: 0.3 },
    { name: '绘本', tier: '三星', probability: 0.15 },
    { name: '披萨套餐', tier: '四星', probability: 0.05 },
  ]

  const totalPulls = Math.floor(Math.random() * 90) + count
  const isGuaranteed = totalPulls % 10 === 0

  let reward
  if (isGuaranteed) {
    // 保底：四星或五星
    reward = Math.random() < 0.3 
      ? { name: '迪士尼一日游', tier: '五星' }
      : { name: '披萨套餐', tier: '四星' }
  } else {
    // 普通抽卡
    const rand = Math.random()
    let cumProb = 0
    for (const r of rewards) {
      cumProb += r.probability
      if (rand < cumProb) {
        reward = r
        break
      }
    }
  }

  resultData.value = { reward, isGuaranteed, totalPulls }
  showResult.value = true

  // 扣粉球
  await authStore.refreshMember()
}

const exchangeReward = async (reward) => {
  alert(`恭喜兑换「${reward.name}」！\n\n请找家长确认领取~`)
  showExchangeModal.value = false
  await authStore.refreshMember()
}
</script>

<style scoped>
.ball-card {
  background: linear-gradient(135deg, #9B59B6, #8E44AD);
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
  color: white;
  margin-bottom: 20px;
}

.ball-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.ball-value {
  font-size: 48px;
  font-weight: 700;
}

.ball-label {
  opacity: 0.9;
  margin-bottom: 16px;
}

.progress-bar {
  height: 8px;
  background: rgba(255,255,255,0.3);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--secondary);
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  opacity: 0.9;
}

.gacha-area {
  text-align: center;
}

.gacha-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

.gacha-info {
  color: var(--text-light);
  margin-bottom: 20px;
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  font-size: 16px;
}

.hint {
  font-size: 12px;
  color: var(--text-light);
}

.exchange-ready {
  text-align: center;
}

.exchange-ready p {
  color: var(--accent);
  font-weight: 500;
  margin-bottom: 12px;
}

.exchange-waiting {
  text-align: center;
}

.exchange-waiting p {
  color: var(--text-light);
  margin-bottom: 8px;
}

.progress-mini {
  height: 6px;
  background: #E8E8E8;
  border-radius: 3px;
  overflow: hidden;
}

.progress-mini-fill {
  height: 100%;
  background: var(--purple);
  transition: width 0.3s;
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
  max-width: 320px;
  width: 90%;
}

.gacha-result {
  text-align: center;
}

.result-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.result-reward {
  font-size: 28px;
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

.result-tier.五星 {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: white;
}

.result-tier.四星 {
  background: linear-gradient(135deg, #9B59B6, #8E44AD);
  color: white;
}

.result-tier.三星 {
  background: var(--sky);
  color: white;
}

.result-tier.普通 {
  background: #E8E8E8;
  color: var(--text);
}

.exchange-modal .modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 12px;
}

.exchange-info {
  color: var(--text-light);
  margin-bottom: 16px;
}

.exchange-rewards {
  margin-bottom: 16px;
}

.reward-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #F9F9F9;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.reward-item:hover {
  background: var(--primary-light);
}

.reward-name {
  font-weight: 500;
}

.tag-star { background: #FFF3E0; color: #FF9800; }
.tag-purple { background: #F3E5F5; color: #9C27B0; }
.tag-sky { background: #E3F2FD; color: #2196F3; }
.tag-green { background: #E8F5E9; color: #4CAF50; }
</style>
