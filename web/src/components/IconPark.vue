<script setup>
// IconPark 图标统一管理
// 使用方式：<Icon name="trash" /> 或 <Icon name="plus" theme="outline" />

import {
  Delete,
  DeleteOne,
  Plus,
  Add,
  Close,
  CloseOne,
  Check,
  Success,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  DoubleUp,
  DoubleDown,
  DoubleLeft,
  DoubleRight,
  Edit,
  Pencil,
  Write,
  Reduce,
  ReduceOne,
  AddOne
} from '@icon-park/vue-next'
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  theme: {
    type: String,
    default: 'outline'
  },
  size: {
    type: [Number, String],
    default: 20
  },
  fill: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: 'inherit'
  },
  strokeWidth: {
    type: [Number, String],
    default: 2
  }
})

const iconName = computed(() => props.name)
</script>

<template>
  <Delete v-if="iconName === 'trash' || iconName === 'delete'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <DeleteOne v-else-if="iconName === 'delete-one'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Plus v-else-if="iconName === 'plus'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Add v-else-if="iconName === 'add'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Close v-else-if="iconName === 'close'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <CloseOne v-else-if="iconName === 'close-one'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Check v-else-if="iconName === 'check'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Success v-else-if="iconName === 'success'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <ArrowUp v-else-if="iconName === 'chevron-up' || iconName === 'up'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <ArrowDown v-else-if="iconName === 'chevron-down' || iconName === 'down'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <ArrowRight v-else-if="iconName === 'chevron-right' || iconName === 'right'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <ArrowLeft v-else-if="iconName === 'chevron-left' || iconName === 'left'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <DoubleUp v-else-if="iconName === 'expand-up'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <DoubleDown v-else-if="iconName === 'expand-down'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <DoubleRight v-else-if="iconName === 'expand-right'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <DoubleLeft v-else-if="iconName === 'expand-left'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Edit v-else-if="iconName === 'edit'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Pencil v-else-if="iconName === 'pen' || iconName === 'pencil'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Write v-else-if="iconName === 'write'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <Reduce v-else-if="iconName === 'minus' || iconName === 'reduce'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <ReduceOne v-else-if="iconName === 'reduce-one'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <AddOne v-else-if="iconName === 'add-one'" :theme="theme" :size="size" :fill="fill" :stroke-width="strokeWidth" />
  <span v-else style="display:inline-block;width:20px;height:20px;text-align:center;line-height:20px;">?</span>
</template>
