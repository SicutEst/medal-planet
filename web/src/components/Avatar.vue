<template>
  <span class="avatar-wrap" :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.85) + 'px' }">
    <img v-if="isImg" :src="avatarSrc(avatar)" alt="" draggable="false">
    <template v-else-if="avatar">{{ avatar }}</template>
    <template v-else>{{ fallbackEmoji }}</template>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { isKnownAvatar, avatarSrc } from '../utils/avatars'

const props = defineProps({
  avatar: { type: String, default: null },
  name: { type: String, default: '' },
  role: { type: String, default: 'child' },
  size: { type: Number, default: 40 }
})

const isImg = computed(() => isKnownAvatar(props.avatar))

// 未选头像时按称呼猜一个 emoji（妈妈/女孩等），老数据里存的 emoji 原样展示
const fallbackEmoji = computed(() => {
  if (props.role === 'parent') {
    return (props.name.includes('妈') || props.name.includes('母')) ? '👩' : '👨'
  }
  return (props.name.includes('妹') || props.name.includes('姐') || props.name.includes('女')) ? '👧' : '👦'
})
</script>

<style scoped>
.avatar-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  line-height: 1;
}

.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 26%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
</style>
