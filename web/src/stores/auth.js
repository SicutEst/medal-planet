import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

// 后端各接口返回的 family 对象键名不一致（create/join 用 code，login 用 family_code），统一归一化
function normalizeFamily(f) {
  if (!f) return f
  const code = f.code || f.family_code || ''
  return { ...f, code, family_code: code }
}

export const useAuthStore = defineStore('auth', () => {
  const member = ref(JSON.parse(localStorage.getItem('member') || 'null'))
  const family = ref(JSON.parse(localStorage.getItem('family') || 'null'))

  const isLoggedIn = computed(() => !!member.value)
  const isParent = computed(() => member.value?.role === 'parent')
  const isChild = computed(() => member.value?.role === 'child')

  async function checkLogin() {
    const savedMember = localStorage.getItem('member')
    if (savedMember) {
      member.value = JSON.parse(savedMember)
      family.value = JSON.parse(localStorage.getItem('family') || '{}')
      // 刷新成员信息
      await refreshMember()
    }
  }

  async function refreshMember() {
    if (!member.value?.id) return
    try {
      const res = await api.get(`/member/${member.value.id}`)
      if (res.success) {
        member.value = res.member
        localStorage.setItem('member', JSON.stringify(res.member))
      }
    } catch (e) {
      console.error('刷新成员信息失败', e)
    }
  }

  // 使用身份创建家庭
  async function createFamilyWithIdentity(familyName, memberName, role, password) {
    const res = await api.post('/family/create', { familyName, memberName, password, role })
    if (res.success) {
      member.value = res.member
      family.value = normalizeFamily(res.family)
      localStorage.setItem('token', res.token)
      localStorage.setItem('member', JSON.stringify(res.member))
      localStorage.setItem('family', JSON.stringify(res.family))
      return true
    }
    return false
  }

  // 使用身份加入家庭
  async function joinFamilyWithIdentity(familyCode, familyName, memberName, role, password) {
    const res = await api.post('/family/join', { familyCode, familyName, memberName, password, role })
    if (res.success) {
      member.value = res.member
      family.value = normalizeFamily(res.family)
      localStorage.setItem('token', res.token)
      localStorage.setItem('member', JSON.stringify(res.member))
      localStorage.setItem('family', JSON.stringify(res.family))
      return true
    }
    return false
  }

  function logout() {
    member.value = null
    family.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('member')
    localStorage.removeItem('family')
  }

  function getRecentFamilies() {
    try {
      const raw = JSON.parse(localStorage.getItem('recentFamilies') || '[]')
      const seen = new Set()
      const deduped = []
      for (const f of raw) {
        if (f.familyId && !seen.has(f.familyId)) {
          seen.add(f.familyId)
          deduped.push(f)
        }
      }
      if (deduped.length !== raw.length) {
        localStorage.setItem('recentFamilies', JSON.stringify(deduped))
      }
      return deduped
    } catch {
      return []
    }
  }

  function saveRecentFamily(familyData, memberData) {
    const recents = getRecentFamilies()
    const idx = recents.findIndex(f => f.familyId === familyData.id)
    const entry = {
      familyId: familyData.id,
      familyCode: familyData.code || familyData.family_code,
      familyName: familyData.name,
      memberId: memberData?.id,
      memberName: memberData?.name,
      lastUsed: Date.now()
    }
    if (idx >= 0) {
      recents.splice(idx, 1)
    }
    recents.unshift(entry)
    if (recents.length > 5) recents.length = 5
    localStorage.setItem('recentFamilies', JSON.stringify(recents))
  }

  function removeRecentFamily(familyId) {
    const recents = getRecentFamilies()
    const idx = recents.findIndex(f => f.familyId === familyId)
    if (idx >= 0) {
      recents.splice(idx, 1)
      localStorage.setItem('recentFamilies', JSON.stringify(recents))
    }
  }

  async function lookupFamily(familyCode) {
    const res = await api.get(`/family/lookup/${familyCode}`)
    return res
  }

  async function loginWithMemberId(memberId, password) {
    const res = await api.post('/family/login-by-id', { memberId, password })
    if (res.success) {
      member.value = res.member
      family.value = normalizeFamily(res.family)
      localStorage.setItem('token', res.token)
      localStorage.setItem('member', JSON.stringify(res.member))
      localStorage.setItem('family', JSON.stringify(res.family))
      saveRecentFamily(res.family, res.member)
      return true
    }
    return false
  }

  return {
    member,
    family,
    isLoggedIn,
    isParent,
    isChild,
    checkLogin,
    refreshMember,
    createFamilyWithIdentity,
    joinFamilyWithIdentity,
    logout,
    getRecentFamilies,
    saveRecentFamily,
    removeRecentFamily,
    lookupFamily,
    loginWithMemberId
  }
})
