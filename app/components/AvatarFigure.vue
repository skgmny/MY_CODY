<script setup lang="ts">
import type { Item, Category } from '~/utils/outfits'

defineProps<{
  shape: { height: number; width: number }
  pieces?: { category: Category; item?: Item }[]
}>()
</script>

<template>
  <div class="avatar-stage" role="img" aria-label="코디 참고용 2D 아바타">
    <div class="avatar-body" :style="{ transform: 'scale(' + shape.width + ', ' + shape.height + ')' }">
      <div class="avatar-head" /><div class="avatar-neck" /><div class="avatar-torso" />
      <div class="avatar-arm left" /><div class="avatar-arm right" />
      <div class="avatar-leg left" /><div class="avatar-leg right" />
      <template v-for="piece in pieces" :key="piece.category">
        <BlobPhoto v-if="piece.item?.wear" :class="['avatar-wear', piece.category]" :blob="piece.item.wear" alt="" />
      </template>
    </div>
  </div>
</template>
