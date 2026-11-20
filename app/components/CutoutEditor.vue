<script setup lang="ts">
import { cutoutPreview, decodeImage, transparentPhoto } from '~/utils/images'

const props = defineProps<{ source: Blob; initialMask?: Blob }>()
const emit = defineEmits<{ apply: [cutout: Blob, mask: Blob]; close: [] }>()
const dialog = ref<HTMLDialogElement>()
const preview = ref<HTMLCanvasElement>()
const tool = ref<'erase' | 'restore'>('erase')
const brush = ref(24)
const ready = ref(false)
const saving = ref(false)
const error = ref('')
let source: HTMLImageElement
let initialMask: HTMLImageElement | undefined
let mask: HTMLCanvasElement
let stroke: { pointer: number; x: number; y: number } | undefined

function render() {
  const canvas = preview.value!
  const context = canvas.getContext('2d')!
  context.globalCompositeOperation = 'source-over'
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)
  context.globalCompositeOperation = 'source-over'
}

function reset() {
  const context = mask.getContext('2d')!
  context.globalCompositeOperation = 'source-over'
  context.clearRect(0, 0, mask.width, mask.height)
  if (initialMask) context.drawImage(initialMask, 0, 0, mask.width, mask.height)
  else {
    context.fillStyle = 'white'
    context.fillRect(0, 0, mask.width, mask.height)
  }
  error.value = ''
  render()
}

onMounted(async () => {
  dialog.value?.showModal()
  try {
    const [image, startingMask] = await Promise.all([
      decodeImage(props.source),
      props.initialMask ? decodeImage(props.initialMask) : undefined,
    ])
    const canvas = preview.value
    if (!canvas) return
    source = image
    initialMask = startingMask
    mask = document.createElement('canvas')
    canvas.width = mask.width = image.naturalWidth
    canvas.height = mask.height = image.naturalHeight
    reset()
    ready.value = true
  } catch {
    error.value = '사진을 편집 화면에서 열지 못했어요.'
  }
})

function paint(event: PointerEvent, start = false) {
  const canvas = preview.value
  if (!canvas || !ready.value || saving.value) return
  if (start ? !event.isPrimary || event.button !== 0 || Boolean(stroke) : stroke?.pointer !== event.pointerId) return
  const bounds = canvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const x = (event.clientX - bounds.left) * canvas.width / bounds.width
  const y = (event.clientY - bounds.top) * canvas.height / bounds.height
  const size = brush.value * canvas.width / bounds.width
  const context = mask.getContext('2d')!
  context.globalCompositeOperation = tool.value === 'erase' ? 'destination-out' : 'source-over'
  context.beginPath()
  if (start) {
    canvas.setPointerCapture(event.pointerId)
    context.fillStyle = 'white'
    context.arc(x, y, size / 2, 0, Math.PI * 2)
    context.fill()
  } else if (stroke) {
    context.lineWidth = size
    context.lineCap = 'round'
    context.strokeStyle = 'white'
    context.moveTo(stroke.x, stroke.y)
    context.lineTo(x, y)
    context.stroke()
  }
  stroke = { pointer: event.pointerId, x, y }
  render()
}

function finishStroke(event: PointerEvent) {
  if (stroke?.pointer === event.pointerId) stroke = undefined
}

async function apply() {
  const canvas = preview.value
  if (!canvas || !ready.value || saving.value || stroke) return
  saving.value = true
  error.value = ''
  try {
    const [cutout, savedMask] = await Promise.all([cutoutPreview(canvas), transparentPhoto(mask)])
    emit('apply', cutout, savedMask)
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="outfit-picker cutout-editor" aria-labelledby="cutout-editor-title"
    @close="emit('close')" @cancel="saving && $event.preventDefault()">
    <div class="form-stack">
      <h2 id="cutout-editor-title">누끼 직접 수정</h2>
      <p class="hint">사진 위를 문질러 남은 배경을 지우거나, 잘린 부분을 복원하세요.</p>
      <div class="chips" role="group" aria-label="편집 도구">
        <button class="chip" type="button" :aria-pressed="tool === 'erase'" :disabled="saving" @click="tool = 'erase'">지우기</button>
        <button class="chip" type="button" :aria-pressed="tool === 'restore'" :disabled="saving" @click="tool = 'restore'">복원</button>
      </div>
      <label class="brush-size">브러시 크기 <input v-model.number="brush" type="range" min="6" max="64" :disabled="saving"></label>
      <p v-if="!ready && !error" class="hint" role="status">편집할 사진을 여는 중이에요…</p>
      <canvas v-show="ready" ref="preview" class="cutout-preview cutout-canvas" aria-label="누끼 편집 사진"
        @pointerdown="paint($event, true)" @pointermove="paint($event)" @pointerup="finishStroke"
        @pointercancel="finishStroke" @lostpointercapture="finishStroke" />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="text-button" :disabled="!ready || saving" @click="reset">편집 초기화</button>
        <button type="button" class="button outline small" :disabled="saving" @click="dialog?.close()">취소</button>
        <button type="button" class="button small" :disabled="!ready || saving" @click="apply">누끼 수정 적용</button>
      </div>
    </div>
  </dialog>
</template>
