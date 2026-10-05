<template>
  <div class="login-page">
    <div class="login-header">
      <div class="logo">🏅</div>
      <h1>奖章星球</h1>
      <p>家庭奖章激励管理系统</p>
    </div>

    <!-- 第一步：选择家庭 -->
    <div v-if="step === 1" class="login-form card fade-in">
      <div class="form-group">
        <label>我的家庭</label>
        
        <div v-if="recentFamilies.length > 0" class="recent-list">
          <div 
            v-for="f in recentFamilies" 
            :key="f.familyId"
            class="recent-item"
            @click="selectRecentFamily(f)"
          >
            <div class="recent-icon">🏠</div>
            <div class="recent-info">
              <div class="recent-name">{{ f.familyName }}</div>
              <div class="recent-code">家庭码：{{ f.familyCode }}</div>
            </div>
            <div class="recent-arrow">›</div>
          </div>
        </div>

        <button class="btn btn-secondary switch-btn" @click="showFamilyInput = !showFamilyInput">
          {{ showFamilyInput ? '取消' : '🔄 切换家庭 / 输入家庭码' }}
        </button>

        <div v-if="showFamilyInput" class="family-input-section">
          <div class="form-group">
            <label>家庭码</label>
            <input 
              v-model="familyCodeInput" 
              type="text" 
              class="input family-code-input" 
              placeholder="输入7位家庭码" 
              maxlength="7"
              @keyup.enter="lookupFamily"
            >
          </div>
          <button 
            class="btn btn-primary" 
            style="width: 100%" 
            @click="lookupFamily" 
            :disabled="lookupLoading || familyCodeInput.length < 4"
          >
            {{ lookupLoading ? '查询中...' : '查找家庭' }}
          </button>
          <p v-if="lookupError" class="error">{{ lookupError }}</p>
        </div>
      </div>

      <p class="hint" @click="showCreate = true" style="cursor: pointer">
        还没有家庭？<span class="link">创建一个新家庭</span>
      </p>
    </div>

    <!-- 第二步：选择身份 -->
    <div v-if="step === 2" class="login-form card fade-in">
      <div class="form-group">
        <div class="family-display">
          <div class="family-name">🏠 {{ currentFamily?.name }}</div>
          <button class="btn btn-sm btn-link" @click="goBackToStep1">切换家庭</button>
        </div>
      </div>

      <div class="form-group">
        <label>选择你的身份</label>
        <div class="member-list">
          <div 
            v-for="m in members" 
            :key="m.id"
            :class="['member-card', { selected: selectedMember?.id === m.id }]"
            @click="selectMember(m)"
          >
            <div class="member-icon">{{ getRoleIcon(m.role) }}</div>
            <div class="member-name">{{ m.name }}</div>
            <div class="member-role">{{ m.role === 'parent' ? '家长' : '孩子' }}</div>
          </div>
        </div>
      </div>

      <button 
        class="btn btn-primary" 
        style="width: 100%" 
        @click="goToStep3" 
        :disabled="!selectedMember"
      >
        下一步
      </button>

      <p class="hint" @click="showJoin = true" style="cursor: pointer">
        不在列表里？<span class="link">加入这个家庭</span>
      </p>
    </div>

    <!-- 第三步：输入密码 -->
    <div v-if="step === 3" class="login-form card fade-in">
      <div class="form-group">
        <div class="member-display">
          <div class="member-icon-big">{{ getRoleIcon(selectedMember?.role) }}</div>
          <div class="member-info">
            <div class="member-name-big">{{ selectedMember?.name }}</div>
            <div class="family-name-small">{{ currentFamily?.name }}</div>
          </div>
          <button class="btn btn-sm btn-link" @click="goBackToStep2">切换</button>
        </div>
      </div>

      <div class="form-group">
        <label>密码</label>
        <input 
          v-model="passwordInput" 
          type="password" 
          class="input" 
          placeholder="请输入密码"
          @keyup.enter="doLogin"
          ref="passwordInputRef"
        >
      </div>

      <button 
        class="btn btn-primary" 
        style="width: 100%" 
        @click="doLogin" 
        :disabled="loginLoading || !passwordInput"
      >
        {{ loginLoading ? '登录中...' : '进入星球 🚀' }}
      </button>
      <p v-if="loginError" class="error">{{ loginError }}</p>
    </div>

    <!-- 创建家庭弹窗 -->
    <div v-if="showCreate" class="modal-overlay" @click="showCreate = false">
      <div class="modal" @click.stop>
        <div class="modal-title">🏠 创建新家庭</div>
        
        <div class="form-group">
          <label>家庭名称</label>
          <input v-model="createForm.familyName" type="text" class="input" placeholder="比如：快乐家族">
        </div>
        <div class="form-group">
          <label>你的身份</label>
          <div class="identity-grid">
            <div 
              v-for="identity in identities" 
              :key="identity.id"
              :class="['identity-card', { selected: createForm.identity === identity.id }]"
              @click="createForm.identity = identity.id"
            >
              <div class="identity-icon">{{ identity.icon }}</div>
              <div class="identity-name">{{ identity.name }}</div>
            </div>
          </div>
          <div v-if="createForm.identity === 'child'" class="nickname-input">
            <input 
              v-model="createForm.nickname" 
              type="text" 
              class="input" 
              placeholder="请输入你的小名（如：小明）"
            >
          </div>
        </div>
        <div class="form-group">
          <label>设定密码</label>
          <input v-model="createForm.password" type="password" class="input" placeholder="请设定密码">
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" @click="doCreate" :disabled="createLoading">
            {{ createLoading ? '创建中...' : '创建家庭' }}
          </button>
        </div>
        <p v-if="createError" class="error">{{ createError }}</p>
      </div>
    </div>

    <!-- 加入家庭弹窗 -->
    <div v-if="showJoin" class="modal-overlay" @click="showJoin = false">
      <div class="modal" @click.stop>
        <div class="modal-title">👥 加入「{{ currentFamily?.name }}」</div>
        
        <div class="form-group">
          <label>你的身份</label>
          <div class="identity-grid">
            <div 
              v-for="identity in identities" 
              :key="identity.id"
              :class="['identity-card', { selected: joinForm.identity === identity.id }]"
              @click="joinForm.identity = identity.id"
            >
              <div class="identity-icon">{{ identity.icon }}</div>
              <div class="identity-name">{{ identity.name }}</div>
            </div>
          </div>
          <div v-if="joinForm.identity === 'child'" class="nickname-input">
            <input 
              v-model="joinForm.nickname" 
              type="text" 
              class="input" 
              placeholder="请输入你的小名（如：小明）"
            >
          </div>
        </div>
        <div class="form-group">
          <label>设定密码</label>
          <input v-model="joinForm.password" type="password" class="input" placeholder="请设定密码">
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showJoin = false">取消</button>
          <button class="btn btn-primary" @click="doJoin" :disabled="joinLoading">
            {{ joinLoading ? '加入中...' : '加入家庭' }}
          </button>
        </div>
        <p v-if="joinError" class="error">{{ joinError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const step = ref(1)
const recentFamilies = ref([])
const showFamilyInput = ref(false)
const familyCodeInput = ref('')
const currentFamily = ref(null)
const members = ref([])
const selectedMember = ref(null)
const passwordInput = ref('')
const passwordInputRef = ref(null)

const lookupLoading = ref(false)
const lookupError = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const createLoading = ref(false)
const createError = ref('')
const joinLoading = ref(false)
const joinError = ref('')

const showCreate = ref(false)
const showJoin = ref(false)

const identities = [
  { id: 'dad', name: '爸爸', icon: '👨', role: 'parent' },
  { id: 'mom', name: '妈妈', icon: '👩', role: 'parent' },
  { id: 'grandpa_m', name: '外公', icon: '👴', role: 'parent' },
  { id: 'grandma_m', name: '外婆', icon: '👵', role: 'parent' },
  { id: 'grandpa_f', name: '爷爷', icon: '👴', role: 'parent' },
  { id: 'grandma_f', name: '奶奶', icon: '👵', role: 'parent' },
  { id: 'child', name: '宝宝', icon: '👶', role: 'child' },
]

const createForm = ref({
  familyName: '',
  identity: '',
  nickname: '',
  password: ''
})

const joinForm = ref({
  identity: '',
  nickname: '',
  password: ''
})

const getRoleIcon = (role) => {
  return role === 'parent' ? '👨‍👩‍👧' : '👦'
}

const getMemberName = (identity, nickname) => {
  const identityObj = identities.find(i => i.id === identity)
  if (!identityObj) return ''
  if (identity === 'child' && nickname) {
    return `${identityObj.name}-${nickname}`
  }
  return identityObj.name
}

const selectRecentFamily = async (f) => {
  lookupLoading.value = true
  lookupError.value = ''
  try {
    const res = await authStore.lookupFamily(f.familyCode)
    if (res.success) {
      currentFamily.value = res.family
      members.value = res.members
      if (f.memberId) {
        const m = res.members.find(mem => mem.id === f.memberId)
        if (m) selectedMember.value = m
      }
      step.value = 2
    } else {
      authStore.removeRecentFamily(f.familyId)
      recentFamilies.value = authStore.getRecentFamilies()
      lookupError.value = '该家庭已不存在，已从列表移除'
    }
  } catch (e) {
    lookupError.value = '查询失败，请重试'
  } finally {
    lookupLoading.value = false
  }
}

const lookupFamily = async () => {
  if (familyCodeInput.value.length < 4) return
  lookupLoading.value = true
  lookupError.value = ''
  try {
    const res = await authStore.lookupFamily(familyCodeInput.value)
    if (res.success) {
      currentFamily.value = res.family
      members.value = res.members
      selectedMember.value = null
      step.value = 2
    } else {
      lookupError.value = res.error || '家庭不存在'
    }
  } catch (e) {
    lookupError.value = '查询失败，请检查家庭码'
  } finally {
    lookupLoading.value = false
  }
}

const selectMember = (m) => {
  selectedMember.value = m
}

const goBackToStep1 = () => {
  step.value = 1
  selectedMember.value = null
  passwordInput.value = ''
  loginError.value = ''
}

const goBackToStep2 = () => {
  step.value = 2
  passwordInput.value = ''
  loginError.value = ''
}

const goToStep3 = () => {
  if (!selectedMember.value) return
  step.value = 3
  nextTick(() => {
    passwordInputRef.value?.focus()
  })
}

const doLogin = async () => {
  if (!selectedMember.value || !passwordInput.value) return
  loginLoading.value = true
  loginError.value = ''
  try {
    const success = await authStore.loginWithMemberId(
      selectedMember.value.id,
      passwordInput.value
    )
    if (success) {
      router.push('/')
    } else {
      loginError.value = '密码错误，请重试'
    }
  } catch (e) {
    loginError.value = '登录失败，请重试'
  } finally {
    loginLoading.value = false
  }
}

const doCreate = async () => {
  if (!createForm.value.familyName || !createForm.value.identity || !createForm.value.password) {
    createError.value = '请填写完整信息'
    return
  }
  if (createForm.value.identity === 'child' && !createForm.value.nickname) {
    createError.value = '请输入宝宝的小名'
    return
  }
  createLoading.value = true
  createError.value = ''
  try {
    const identity = identities.find(i => i.id === createForm.value.identity)
    const memberName = getMemberName(createForm.value.identity, createForm.value.nickname)
    const success = await authStore.createFamilyWithIdentity(
      createForm.value.familyName,
      memberName,
      identity.role,
      createForm.value.password
    )
    if (success) {
      const code = authStore.family?.code || authStore.family?.family_code
      alert(`🎉 家庭创建成功！\n\n家庭码：${code}\n家庭名称：${authStore.family?.name}\n\n请记好家庭码，分享给家人加入。`)
      authStore.saveRecentFamily(authStore.family, authStore.member)
      showCreate.value = false
      router.push('/settings')
    } else {
      createError.value = '创建失败，请重试'
    }
  } catch (e) {
    createError.value = '创建失败，请重试'
  } finally {
    createLoading.value = false
  }
}

const doJoin = async () => {
  if (!joinForm.value.identity || !joinForm.value.password) {
    joinError.value = '请填写完整信息'
    return
  }
  if (joinForm.value.identity === 'child' && !joinForm.value.nickname) {
    joinError.value = '请输入宝宝的小名'
    return
  }
  joinLoading.value = true
  joinError.value = ''
  try {
    const identity = identities.find(i => i.id === joinForm.value.identity)
    const memberName = getMemberName(joinForm.value.identity, joinForm.value.nickname)
    const success = await authStore.joinFamilyWithIdentity(
      currentFamily.value.code,
      currentFamily.value.name,
      memberName,
      identity.role,
      joinForm.value.password
    )
    if (success) {
      authStore.saveRecentFamily(authStore.family, authStore.member)
      showJoin.value = false
      router.push('/')
    } else {
      joinError.value = '加入失败，请重试'
    }
  } catch (e) {
    joinError.value = '加入失败，请重试'
  } finally {
    joinLoading.value = false
  }
}

onMounted(() => {
  recentFamilies.value = authStore.getRecentFamilies()
  // 检查 URL 中是否有邀请码（从邀请链接跳转来）
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code) {
    familyCodeInput.value = code.toUpperCase()
    showFamilyInput.value = true
    nextTick(() => lookupFamily())
    // 清除 URL 中的 code 参数，避免刷新时重复触发
    window.history.replaceState({}, '', window.location.pathname)
  }
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--primary-light) 0%, var(--bg) 100%);
  padding: 40px 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  font-size: 72px;
  margin-bottom: 12px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.login-header h1 {
  font-size: 28px;
  color: var(--primary-dark);
  margin-bottom: 4px;
}

.login-header p {
  color: var(--text-light);
  font-size: 14px;
}

.login-form {
  padding: 24px;
  max-width: 400px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text);
  font-size: 14px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: #F8F9FA;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.recent-item:hover {
  background: #F0F2F5;
  border-color: var(--primary-light);
}

.recent-icon {
  font-size: 32px;
}

.recent-info {
  flex: 1;
}

.recent-name {
  font-weight: 600;
  color: var(--text);
  font-size: 15px;
}

.recent-code {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 2px;
}

.recent-arrow {
  font-size: 24px;
  color: var(--text-light);
}

.switch-btn {
  width: 100%;
  margin-bottom: 4px;
}

.family-input-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #EEE;
}

.family-code-input {
  text-align: center;
  font-size: 20px;
  letter-spacing: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.family-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, var(--primary-light), #E8F4FD);
  border-radius: var(--radius-sm);
}

.family-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--primary-dark);
}

.member-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.member-card {
  background: #F8F9FA;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  padding: 16px 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.member-card:hover {
  background: #F0F2F5;
}

.member-card.selected {
  border-color: var(--primary);
  background: var(--primary-light);
}

.member-icon {
  font-size: 36px;
  margin-bottom: 6px;
}

.member-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}

.member-role {
  font-size: 11px;
  color: var(--text-light);
  margin-top: 2px;
}

.member-card.selected .member-name {
  color: var(--primary-dark);
}

.member-display {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: linear-gradient(135deg, var(--primary-light), #E8F4FD);
  border-radius: var(--radius-sm);
}

.member-icon-big {
  font-size: 48px;
}

.member-info {
  flex: 1;
}

.member-name-big {
  font-weight: 700;
  font-size: 18px;
  color: var(--primary-dark);
}

.family-name-small {
  font-size: 13px;
  color: var(--text-light);
  margin-top: 2px;
}

.error {
  color: #FF3B30;
  text-align: center;
  margin-top: 12px;
  font-size: 14px;
}

.hint {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: var(--text-light);
}

.link {
  color: var(--primary);
  font-weight: 500;
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
}

.identity-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.identity-card {
  background: #F8F8F8;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  padding: 14px 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.identity-card:hover {
  background: #F0F0F0;
}

.identity-card.selected {
  border-color: var(--primary);
  background: var(--primary-light);
}

.identity-icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.identity-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.identity-card.selected .identity-name {
  color: var(--primary-dark);
}

.nickname-input {
  margin-top: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: white;
  border-radius: var(--radius);
  padding: 24px;
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  text-align: center;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-actions .btn {
  flex: 1;
}

.fade-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 400px) {
  .identity-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .member-list {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
