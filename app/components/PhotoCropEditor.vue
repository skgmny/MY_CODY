<script setup lang="ts">
import { resizePhotoBounds, type CropHandle, type PhotoBounds } from '~/utils/images'

defineProps<{ file: Blob; label: string; disabled?: boolean }>()
const bounds = defineModel<PhotoBounds>({ required: true })
const image = ref<HTMLElement>()
const handles: { id: CropHandle; label: string; x: 'left' | 'right' | 'center'; y: 'top' | 'bottom' | 'center' }[] = [
  { id: 'nw', label: '왼쪽 위', x: 'left', y: 'top' },
  { id: 'n', label: '위쪽', x: 'center', y: 'top' },
  { id: 'ne', label: '오른쪽 위', x: 'right', y: 'top' },
  { id: 'w', label: '왼쪽', x: 'left', y: 'center' },
  { id: 'e', label: '오른쪽', x: 'right', y: 'center' },
  { id: 'sw', label: '왼쪽 아래', x: 'left', y: 'bottom' },
  { id: 's', label: '아래쪽', x: 'center', y: 'bottom' },
  { id: 'se', label: '오른쪽 아래', x: 'right', y: 'bottom' },
]
let drag: { id: number; handle: CropHandle; x: number; y: number; start: PhotoBounds } | undefined

function startDrag(event: PointerEvent, handle: CropHandle) {
  if (event.button !== 0 || drag) return
  const target = event.currentTarget as HTMLButtonElement
  target.setPointerCapture(event.pointerId)
  drag = { id: event.pointerId, handle, x: event.clientX, y: event.clientY, start: { ...bounds.value } }
}

function moveDrag(event: PointerEvent) {
  if (drag?.id !== event.pointerId || !image.value) return
  const rect = image.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  bounds.value = resizePhotoBounds(drag.start, drag.handle,
    (event.clientX - drag.x) / rect.width * 100, (event.clientY - drag.y) / rect.height * 100)
}

function stopDrag(event: PointerEvent) {
  if (drag?.id === event.pointerId) drag = undefined
}

function moveWithKeyboard(event: KeyboardEvent, handle: CropHandle) {
  const arrow: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  }
  const direction = arrow[event.key]
  if (!direction) return
  event.preventDefault()
  const step = event.shiftKey ? 5 : 1
  bounds.value = resizePhotoBounds(bounds.value, handle, direction[0] * step, direction[1] * step)
}
</script>

<template>
  <div class="crop-editor-preview">
    <div ref="image" class="crop-editor-image">
      <div class="crop-editor-media">
        <BlobPhoto :blob="file" :alt="label" />
        <span class="crop-editor-frame" aria-hidden="true" :style="{
          inset: bounds.top + '% ' + (100 - bounds.right) + '% ' +
            (100 - bounds.bottom) + '% ' + bounds.left + '%',
        }"></span>
      </div>
      <button v-for="handle in handles" :key="handle.id" type="button" :disabled="disabled"
        class="crop-handle" :class="'crop-handle-' + handle.id" :aria-label="handle.label + ' 자르기 손잡이'"
        :style="{
          left: (handle.x === 'center' ? (bounds.left + bounds.right) / 2 : bounds[handle.x]) + '%',
          top: (handle.y === 'center' ? (bounds.top + bounds.bottom) / 2 : bounds[handle.y]) + '%',
        }"
        @pointerdown="startDrag($event, handle.id)" @pointermove="moveDrag"
        @pointerup="stopDrag" @pointercancel="stopDrag" @lostpointercapture="stopDrag"
        @keydown="moveWithKeyboard($event, handle.id)">
        <span aria-hidden="true"></span>
      </button>
    </div>
  </div>
</template>
