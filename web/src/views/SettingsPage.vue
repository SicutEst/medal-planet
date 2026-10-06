<template>
  <div class="page">
    <div class="header">
      <h1>⚙️ 设置</h1>
    </div>

    <!-- 家庭信息 -->
    <div class="card">
      <div class="family-info">
        <img class="family-avatar" src="/avatars/ringed_planet.png" alt="家庭">
        <div class="family-details">
          <div class="family-name">{{ family?.name }}</div>
          <div class="family-code">家庭码: <strong>{{ family?.family_code }}</strong></div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="copyCode">
        {{ copied ? '已复制!' : '复制' }}
      </button>
    </div>

    <!-- 我的头像 -->
    <div class="card">
      <h3>🧑‍🎨 我的头像</h3>
      <div class="avatar-section">
        <div class="current-avatar" @click="showAvatarPicker = !showAvatarPicker">
          <Avatar :avatar="authStore.member?.avatar" :name="authStore.member?.name" :role="authStore.member?.role" :size="56" />
          <span class="change-hint">点击更换</span>
        </div>
        <div v-if="showAvatarPicker" class="avatar-picker">
          <div class="ap-tabs">
            <button v-for="c in avatarCategories" :key="c.id" class="ap-tab"
                    :class="{ active: avatarTab === c.id }" @click="avatarTab = c.id">
              {{ c.name }}
            </button>
          </div>
          <input v-model.trim="avatarSearch" class="input ap-search" placeholder="搜索（英文名，可留空）">
          <div class="ap-grid">
            <button v-for="id in filteredAvatars" :key="id" class="ap-cell"
                    :class="{ selected: id === authStore.member?.avatar }"
                    @click="selectAvatar(id)">
              <img :src="avatarSrc(id)" alt="" loading="lazy" draggable="false">
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 邀请成员 -->
    <div class="card invite-card">
      <h3>📨 邀请成员加入</h3>
      <p class="invite-desc">分享以下任一方式，让家人加入你的家庭</p>

      <!-- 二维码 -->
      <div class="qr-section">
        <canvas ref="qrCanvas"></canvas>
        <p class="qr-hint">扫一扫加入家庭</p>
      </div>

      <!-- 邀请链接 -->
      <div class="invite-link-section">
        <label>邀请链接</label>
        <div class="link-row">
          <input class="input link-input" :value="inviteLink" readonly>
          <button class="btn btn-primary btn-sm" @click="copyLink">
            {{ linkCopied ? '已复制!' : '复制链接' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 成员列表 -->
    <div class="card">
      <h3>👥 家庭成员</h3>
      <div v-if="members.length > 0">
        <div v-for="member in members" :key="member.id" class="member-item">
          <div class="member-info">
            <Avatar :avatar="member.avatar" :name="member.name" :role="member.role" :size="40" />
            <div>
              <div class="member-name">{{ member.name }}</div>
              <div class="member-role">{{ member.role === 'parent' ? '家长' : '孩子' }}</div>
            </div>
          </div>
          <div class="member-stats" v-if="member.role !== 'parent'">
            <span>{{ cur[0] }} {{ member.current_stickers }}</span>
            <span>{{ cur[1] }} {{ member.current_balls }}</span>
          </div>
          <div class="member-stats" v-else>
            <span class="member-nocur">不参与攒奖</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 调整贴纸（家长功能） -->
    <div v-if="authStore.isParent" class="card">
      <h3>📝 手动调整</h3>
      <div class="adjust-form">
        <select v-model="adjustForm.memberId" class="input">
          <option value="">选择成员</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <div class="adjust-amount">
          <button @click="adjustForm.amount--" class="btn btn-sm">-</button>
          <input v-model.number="adjustForm.amount" type="number" class="input" style="width: 80px; text-align: center">
          <button @click="adjustForm.amount++" class="btn btn-sm">+</button>
        </div>
        <input v-model="adjustForm.remark" type="text" class="input" placeholder="备注（可选）">
        <div class="adjust-buttons">
          <button class="btn btn-success" @click="doAdjust('earn')" :disabled="!adjustForm.memberId">
            奖励贴纸
          </button>
          <button class="btn btn-warning" @click="doAdjust('penalty')" :disabled="!adjustForm.memberId">
            扣除贴纸
          </button>
        </div>
      </div>
    </div>

    <!-- 危险操作（家长功能） -->
    <div v-if="authStore.isParent" class="card danger-zone">
      <h3>⚠️ 危险操作</h3>
      <p class="danger-desc">以下操作不可逆，请谨慎操作</p>
      <div class="danger-buttons">
        <button class="btn btn-warning" @click="resetFamilyData">
          🧹 一键清除数据
        </button>
        <button class="btn btn-danger" @click="deleteFamily">
          💀 删除家庭
        </button>
      </div>
    </div>

    <!-- 换皮肤 -->
    <div class="card">
      <h3>🎨 换皮肤</h3>
      <p class="theme-tip">每个成员可以选自己喜欢的主题，只影响自己</p>
      <div class="theme-list">
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-row"
          :class="{ active: currentThemeId === t.id }"
          @click="pickTheme(t.id)"
        >
          <span class="theme-dots">
            <i v-for="(c, i) in t.colors" :key="i" :style="{ background: c }"></i>
          </span>
          <span class="theme-info">
            <span class="theme-name">{{ t.name }}</span>
            <span class="theme-desc">{{ t.desc }}</span>
          </span>
          <span class="theme-cur">{{ t.cur[0] }} {{ t.cur[1] }}</span>
          <span class="theme-check">{{ currentThemeId === t.id ? '✓' : '' }}</span>
        </button>
      </div>
    </div>

    <!-- 登出 -->
    <button class="btn btn-secondary" style="width: 100%" @click="logout">
      🚪 退出登录
    </button>

    <div class="app-info">
      <p>🏅 奖章星球 v1.0</p>
      <p>家庭奖章激励管理系统</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import QRCode from 'qrcode'
import { THEMES, currentTheme, applyTheme, themeCurrencies } from '../utils/theme'
import Avatar from '../components/Avatar.vue'
import { AVATAR_CATEGORIES, avatarSrc } from '../utils/avatars'

const authStore = useAuthStore()

const cur = computed(() => themeCurrencies())

// 主题
const themes = THEMES
const currentThemeId = currentTheme
const pickTheme = (id) => {
  applyTheme(id, authStore.member?.id)
}
const members = ref([])
const copied = ref(false)
const linkCopied = ref(false)
const qrCanvas = ref(null)

const family = computed(() => authStore.family)

const inviteLink = computed(() => {
  if (!family.value?.family_code) return ''
  const origin = window.location.origin
  return `${origin}/?code=${family.value.family_code}`
})

const generateQR = async () => {
  if (!qrCanvas.value || !inviteLink.value) return
  await QRCode.toCanvas(qrCanvas.value, inviteLink.value, {
    width: 200,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' }
  })
}

watch(() => family.value?.family_code, () => {
  nextTick(() => generateQR())
})

const adjustForm = ref({
  memberId: '',
  amount: 0,
  remark: ''
})

const loadMembers = async () => {
  if (!authStore.family?.id) return
  try {
    const res = await api.get(`/family/${authStore.family.id}/members`)
    if (res.success) {
      members.value = res.members || []
    }
  } catch (e) {
    console.error('获取成员失败', e)
  }
}

const avatarCategories = AVATAR_CATEGORIES
const avatarTab = ref('person')
const avatarSearch = ref('')
const filteredAvatars = computed(() => {
  const kw = avatarSearch.value.toLowerCase()
  // 搜索时跨全部分类找，否则只看当前页签
  const items = kw ? avatarCategories.flatMap(c => c.items) : avatarCategories.find(c => c.id === avatarTab.value).items
  return items.filter(id => id.includes(kw))
})

const showAvatarPicker = ref(false)

const selectAvatar = async (avatar) => {
  try {
    const res = await api.put(`/member/${authStore.member.id}`, { avatar })
    if (res.success) {
      authStore.member.avatar = avatar
      localStorage.setItem('member', JSON.stringify(authStore.member))
      await loadMembers()
    }
  } catch (e) {
    console.error('更新头像失败', e)
  }
  showAvatarPicker.value = false
}

const copyCode = () => {
  navigator.clipboard.writeText(family.value?.family_code)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

const copyLink = () => {
  navigator.clipboard.writeText(inviteLink.value)
  linkCopied.value = true
  setTimeout(() => linkCopied.value = false, 2000)
}

const doAdjust = async (type) => {
  if (!adjustForm.value.memberId) return
  try {
    await api.post('/sticker/adjust', {
      memberId: adjustForm.value.memberId,
      changeType: type,
      amount: Math.abs(adjustForm.value.amount),
      remark: adjustForm.value.remark || (type === 'earn' ? '家长奖励' : '家长扣减'),
      operatorId: authStore.member.id
    })
    alert(`${type === 'earn' ? '奖励' : '扣除'}成功！`)
    adjustForm.value = { memberId: '', amount: 0, remark: '' }
    await loadMembers()
    await authStore.refreshMember()
  } catch (e) {
    alert('操作失败')
  }
}

const logout = () => {
  if (confirm('确定要退出登录吗？')) {
    authStore.logout()
  }
}

const resetFamilyData = async () => {
  if (!confirm('⚠️ 确定要清除家庭所有数据吗？\n\n将清除：任务、奖励、贴纸记录、完成记录等所有配置和历史数据\n保留：家庭信息、成员账号\n\n此操作不可恢复！')) {
    return
  }
  const familyName = prompt(`请输入家庭名称「${family.value?.name}」以确认清除：`)
  if (familyName !== family.value?.name) {
    alert('家庭名称不匹配，操作已取消')
    return
  }
  const password = prompt('请输入您的密码以确认：')
  if (!password) {
    alert('密码不能为空')
    return
  }
  try {
    const res = await api.post(`/family/${authStore.family.id}/reset`, {
      operatorId: authStore.member.id,
      password
    })
    if (res.success) {
      alert('✅ 家庭数据已清除')
      await authStore.refreshMember()
      await loadMembers()
    } else {
      alert(res.error || '清除失败')
    }
  } catch (e) {
    alert('清除失败')
  }
}

const deleteFamily = async () => {
  if (!confirm('💀 确定要彻底删除这个家庭吗？\n\n将删除：所有成员、任务、奖励、记录等全部数据\n删除后无法恢复，家庭码将失效！\n\n此操作不可恢复！')) {
    return
  }
  const familyName = prompt(`请输入家庭名称「${family.value?.name}」以确认删除：`)
  if (familyName !== family.value?.name) {
    alert('家庭名称不匹配，操作已取消')
    return
  }
  const password = prompt('请输入您的密码以确认：')
  if (!password) {
    alert('密码不能为空')
    return
  }
  try {
    const res = await api.delete(`/family/${authStore.family.id}`, {
      data: {
        operatorId: authStore.member.id,
        password
      }
    })
    if (res.success) {
      alert('✅ 家庭已删除')
      const familyId = authStore.family.id
      authStore.removeRecentFamily(familyId)
      authStore.logout()
    } else {
      alert(res.error || '删除失败')
    }
  } catch (e) {
    alert('删除失败')
  }
}

onMounted(() => {
  loadMembers()
  nextTick(() => generateQR())
})
</script>

<style scoped>
.family-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.family-avatar {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 26%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.invite-card {
  text-align: center;
}

.invite-desc {
  color: var(--text-light);
  font-size: 13px;
  margin-bottom: 16px;
}

.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.qr-section canvas {
  border-radius: var(--radius-sm);
  border: 1px solid #EEE;
}

.qr-hint {
  font-size: 13px;
  color: var(--text-light);
}

.invite-link-section {
  text-align: left;
}

.invite-link-section label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.link-row {
  display: flex;
  gap: 8px;
}

.link-input {
  flex: 1;
  font-size: 12px;
  color: var(--text-light);
}

.family-details {
  flex: 1;
}

.family-name {
  font-size: 20px;
  font-weight: 700;
}

.family-code {
  color: var(--text-light);
  font-size: 14px;
}

.card h3 {
  margin-bottom: 16px;
  font-size: 16px;
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #F5F5F5;
}

.member-item:last-child {
  border-bottom: none;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-name {
  font-weight: 600;
}

.member-role {
  font-size: 12px;
  color: var(--text-light);
}

.member-stats {
  display: flex;
  gap: 12px;
  font-size: 14px;
}

.member-nocur {
  font-size: 12px;
  color: var(--text-light);
}

.adjust-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.adjust-amount {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.adjust-buttons {
  display: flex;
  gap: 12px;
}

.adjust-buttons .btn {
  flex: 1;
}

.app-info {
  text-align: center;
  padding: 40px 0;
  color: var(--text-light);
  font-size: 12px;
}

.app-info p:first-child {
  font-size: 16px;
  margin-bottom: 4px;
}

.danger-zone {
  border: 2px solid #FF6B6B;
  background: linear-gradient(135deg, #FFF5F5, #FFEBEB);
}

.danger-zone h3 {
  color: #E53935;
}

.danger-desc {
  color: #C62828;
  font-size: 13px;
  margin-bottom: 16px;
}

.danger-buttons {
  display: flex;
  gap: 12px;
}

.danger-buttons .btn {
  flex: 1;
}

.btn-danger {
  background: linear-gradient(135deg, #FF6B6B, #E53935);
  color: white;
  box-shadow: 0 4px 15px rgba(229, 57, 53, 0.3);
}

.btn-danger:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(229, 57, 53, 0.4);
}

.avatar-section {
  text-align: center;
}

.current-avatar {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg);
  border-radius: var(--radius-card);
  cursor: pointer;
  transition: transform 0.2s;
}

.current-avatar:hover {
  transform: scale(1.05);
}

.change-hint {
  font-size: 12px;
  color: var(--text-light);
}

.avatar-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: var(--bg);
  border-radius: var(--radius-card);
}

.ap-tabs {
  display: flex;
  gap: 8px;
}

.ap-tab {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: var(--card-bg);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-light);
  cursor: pointer;
  transition: all 0.2s;
}

.ap-tab.active {
  background: var(--primary);
  color: white;
  font-weight: 600;
}

.ap-search {
  padding: 8px 12px;
  font-size: 13px;
}

.ap-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 2px;
}

.ap-cell {
  aspect-ratio: 1;
  padding: 4px;
  background: var(--card-bg);
  border: 2px solid transparent;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.15s;
}

.ap-cell img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.ap-cell:hover {
  border-color: var(--primary);
  transform: scale(1.08);
}

.ap-cell.selected {
  border-color: var(--primary);
  background: var(--primary-light, rgba(255, 105, 180, 0.12));
}
.theme-tip {
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 12px;
}

.theme-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card-bg);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  text-align: left;
}

.theme-row:active {
  transform: scale(0.99);
}

.theme-row.active {
  border-color: var(--primary);
  background: var(--primary-light);
}

.theme-dots {
  display: flex;
  flex-shrink: 0;
}

.theme-dots i {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  margin-left: -5px;
}

.theme-dots i:first-child {
  margin-left: 0;
}

.theme-info {
  flex: 1;
  min-width: 0;
}

.theme-name {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.theme-desc {
  display: block;
  font-size: 11px;
  color: var(--text-light);
  margin-top: 1px;
}

.theme-cur {
  font-size: 14px;
  flex-shrink: 0;
  color: var(--text-light);
}

.theme-check {
  width: 20px;
  text-align: center;
  color: var(--primary-dark);
  font-weight: 700;
  flex-shrink: 0;
}
</style>
