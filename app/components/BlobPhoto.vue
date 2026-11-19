<script setup lang="ts">
const props = defineProps<{ blob: Blob; alt: string }>()
const src = ref('')
watch(() => props.blob, (blob, _, onCleanup) => {
  const url = URL.createObjectURL(blob)
  src.value = url
  onCleanup(() => URL.revokeObjectURL(url))
}, { immediate: true })
</script>

<template>
  <img :src="src" :alt="alt" decoding="async">
</template>
