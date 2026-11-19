<script setup lang="ts">
import { Shirt } from 'lucide-vue-next'
import { labels, resolveItems, type Item, type Look, type Category } from '~/utils/outfits'

const props = defineProps<{ items: Item[]; look: Look; editable?: boolean }>()
defineEmits<{ replace: [category: Category] }>()
const pieces = computed(() => resolveItems(props.items, props.look.ids))
</script>

<template>
  <div class="look-grid">
    <component :is="editable ? 'button' : 'div'" v-for="{ category, item } in pieces" :key="category"
      class="piece" :type="editable ? 'button' : undefined" @click="editable && $emit('replace', category)">
      <BlobPhoto v-if="item" :blob="item.photo" :alt="item.name || labels[category]" />
      <div v-else class="placeholder"><Shirt :size="22" /></div>
      <span>{{ labels[category] }}</span>
      <strong>{{ item ? (item.name || labels[category]) : (look.ids[category] ? '옷장에서 삭제됨' : '선택 전') }}</strong>
    </component>
  </div>
</template>
