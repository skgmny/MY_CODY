<script setup lang="ts">
import { Shirt } from 'lucide-vue-next'
import { labels, outfitPhoto, resolveItems, type Item, type Look, type Category } from '~/utils/outfits'

const props = defineProps<{ items: Item[]; look: Look; editable?: boolean; vertical?: boolean; photoFirst?: boolean }>()
defineEmits<{ replace: [category: Category] }>()
const pieces = computed(() => resolveItems(props.items, props.look.ids))
</script>

<template>
  <div class="look-grid" :class="{ 'look-vertical': vertical, 'look-photo-first': photoFirst }">
    <component :is="editable ? 'button' : 'div'" v-for="{ category, item } in pieces" :key="category"
      class="piece" :class="'piece-' + category" :type="editable ? 'button' : undefined" @click="editable && $emit('replace', category)">
      <BlobPhoto v-if="item" :blob="outfitPhoto(item)" :alt="item.name || labels[category]" />
      <div v-else class="placeholder"><Shirt :size="22" /></div>
      <template v-if="!photoFirst || !item">
        <span>{{ labels[category] }}</span>
        <strong>{{ item ? (item.name || labels[category]) : (look.ids[category] ? '옷장에서 삭제됨' : '선택 전') }}</strong>
      </template>
    </component>
  </div>
</template>
