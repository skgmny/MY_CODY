<script setup lang="ts">
import { ArrowLeft, ArrowRight, Bookmark, Camera, ChevronRight, Heart, House, ImagePlus,
  Layers3, Plus, Shirt, Sparkles } from 'lucide-vue-next'
import { categories, labels, orderedItems, outfitPhoto, recommendation, resolveItems, tags,
  type Category, type Item, type Look, type SavedLook, type Selection, type Tag } from '~/utils/outfits'
import { read, readAll, remove, write, writeItems } from '~/utils/storage'
import { cropPhoto, defaultCrop } from '~/utils/images'

type Screen = 'home' | 'wardrobe' | 'item' | 'recommend' | 'manual' | 'preview' | 'saved'
const nav = [{ id: 'home', label: '홈', icon: House }, { id: 'wardrobe', label: '내 옷장', icon: Shirt },
  { id: 'saved', label: '저장 코디', icon: Bookmark }] as const
const titles: Record<Screen, string> = {
  home: '홈', wardrobe: '내 옷장', item: '옷 등록', recommend: '코디 추천', manual: '직접 코디',
  preview: '코디 미리보기', saved: '저장 코디',
}
const screen = ref<Screen>('home')
const trail = ref<Screen[]>([])
const main = ref<HTMLElement>()
const items = shallowRef<Item[]>([])
const saved = shallowRef<SavedLook[]>([])
const savedFilter = ref<Tag | '' | 'all'>('all')
const visibleSaved = computed(() => savedFilter.value === 'all'
  ? saved.value
  : saved.value.filter(look => look.situation === savedFilter.value))
const ready = ref(false)
const loadError = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const filter = ref<Category | 'all'>('all')
const editId = ref('')
const category = ref<Category | ''>('')
const name = ref('')
const selectedTags = ref<Tag[]>([])
const original = shallowRef<Blob>()
const cutout = shallowRef<Blob>()
const photo = shallowRef<Blob>()
const crop = ref(defaultCrop())
const appliedCrop = shallowRef(defaultCrop())
const cropping = ref(false)
const processing = ref(false)
const replacingPhoto = ref(false)
const photoError = ref('')
const photoNotes = ref<string[]>([])
const analysis = shallowRef<AbortController>()
type BatchPhoto = { file: File; photo?: Blob; originalPreview?: Blob; cutout?: Blob; category: Category | ''; tags: Tag[]; notes?: string[]; error?: string }
const batch = ref<BatchPhoto[]>([])
let photoVersion = 0
const shareHint = ref('')
const recommendedSituation = ref<Tag | ''>('')
const situation = ref<Tag | ''>('')
const index = ref(0)
const started = ref(false)
const session = shallowRef<ReturnType<typeof recommendation<Item>>>()
const emptySelection = (): Selection => ({ top: '', bottom: '', shoes: '' })
const selection = ref(emptySelection())
const preview = shallowRef<Look | SavedLook>()

const recent = computed(() => saved.value.slice(0, 2))
const wardrobe = computed(() => items.value.filter(item => filter.value === 'all' || item.category === filter.value))
const currentIds = computed(() => session.value?.at(index.value))
const suggested = computed<Look | undefined>(() => currentIds.value
  ? { ids: currentIds.value, situation: recommendedSituation.value, mode: 'recommend' } : undefined)
const manualRows = computed(() => categories.map(kind => {
  const options = orderedItems(items.value, kind, situation.value)
  const index = Math.max(0, options.findIndex(item => item.id === selection.value[kind]))
  return { kind, options, index, item: options[index] }
}))
const manual = computed<Look>(() => {
  const ids = emptySelection()
  for (const row of manualRows.value) ids[row.kind] = row.item?.id ?? ''
  return { ids, situation: situation.value, mode: 'manual' }
})
const complete = computed(() => manualRows.value.every(row => row.item))
const missingCategories = computed(() => categories.filter(kind => !items.value.some(item => item.category === kind)))
const savedPreview = computed(() => preview.value && 'id' in preview.value ? preview.value : undefined)

function show(next: Screen, tab = false) {
  if (busy.value) return
  if (tab) trail.value = []
  else if (next !== screen.value) trail.value.push(screen.value)
  screen.value = next
  error.value = ''
  nextTick(() => {
    window.scrollTo(0, 0)
    main.value?.focus({ preventScroll: true })
  })
}

function back() {
  if (busy.value) return
  const next = trail.value.pop() ?? 'home'
  const rest = [...trail.value]
  show(next, true)
  trail.value = rest
}

async function initialize() {
  loadError.value = ''
  try {
    const [clothes, looks] = await Promise.all([readAll('items'), readAll('looks')])
    items.value = clothes.sort((a, b) => b.created - a.created)
    saved.value = looks.sort((a, b) => b.saved - a.saved)
    ready.value = true
  } catch {
    loadError.value = '이 브라우저에서 옷장 데이터를 열 수 없어요. 저장 공간 설정을 확인해 주세요.'
    return
  }
  const url = new URL(location.href)
  const token = url.searchParams.get('share')
  if (!token) return
  openItem()
  try {
    const shared = token === 'fallback' ? undefined : await read('inbox', token)
    if (shared) {
      await setPhoto(shared)
      await remove('inbox', token)
    }
    if (!shared || !original.value) shareHint.value = '공유된 사진을 열 수 없어요. 사진 보관함에서 직접 선택해 주세요.'
  } catch {
    shareHint.value = '공유된 사진을 열 수 없어요. 사진 보관함에서 직접 선택해 주세요.'
  } finally {
    url.searchParams.delete('share')
    history.replaceState(history.state, '', url)
  }
}

onMounted(() => {
  void initialize()
  if ('serviceWorker' in navigator && !import.meta.dev) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      notice.value = '이 브라우저에서 앱 설치 및 공유 수신을 설정할 수 없어요. 사진은 직접 등록할 수 있어요.'
    })
  }
})

function openItem(item?: Item, kind?: Category) {
  analysis.value?.abort()
  analysis.value = undefined
  photoVersion++
  processing.value = false
  replacingPhoto.value = false
  photoError.value = ''
  photoNotes.value = []
  batch.value = []
  editId.value = item?.id ?? ''
  category.value = item?.category ?? kind ?? ''
  name.value = item?.name ?? ''
  selectedTags.value = [...(item?.tags ?? [])]
  original.value = item?.original
  cutout.value = item?.cutout
  photo.value = item?.photo
  appliedCrop.value = item?.crop ? { ...item.crop } : defaultCrop()
  crop.value = { ...appliedCrop.value }
  cropping.value = false
  shareHint.value = ''
  show('item')
}

async function suggestPhoto(file: Blob, signal: AbortSignal) {
  if (signal.aborted) return
  let stop: () => void = () => {}
  const cancelled = new Promise<undefined>(resolve => {
    stop = () => resolve(undefined)
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    const task = import('~/utils/auto-photo').then(({ analyzePhoto }) => analyzePhoto(file, signal))
    return await Promise.race([task, cancelled])
  } catch {
    if (!signal.aborted) return { cutout: undefined, category: '' as const, tags: [], notes: ['자동 처리를 불러오지 못했어요. 직접 선택해 주세요.'] }
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

async function setPhoto(file: Blob) {
  const version = ++photoVersion
  const defaults = defaultCrop()
  processing.value = true
  replacingPhoto.value = true
  photoError.value = ''
  photoNotes.value = []
  try {
    const result = await cropPhoto(file, defaults)
    if (version !== photoVersion) return
    original.value = file
    cutout.value = undefined
    appliedCrop.value = defaults
    crop.value = { ...defaults }
    photo.value = result
    cropping.value = false
    const controller = new AbortController()
    analysis.value = controller
    const suggestion = await suggestPhoto(file, controller.signal)
    if (version !== photoVersion || !suggestion) return
    photoNotes.value = suggestion.notes
    if (suggestion.cutout) {
      const transparent = await cropPhoto(suggestion.cutout, defaults)
      if (version !== photoVersion || controller.signal.aborted) return
      cutout.value = suggestion.cutout
      photo.value = transparent
    }
    if (!editId.value && !controller.signal.aborted) {
      if (suggestion.category) category.value = suggestion.category
      selectedTags.value = [...new Set([...selectedTags.value, ...suggestion.tags])]
    }
  } catch (cause) {
    if (version === photoVersion) {
      analysis.value = undefined
      crop.value = { ...appliedCrop.value }
      photoError.value = (cause as Error).message
    }
  } finally {
    if (version === photoVersion) {
      processing.value = false
      replacingPhoto.value = false
    }
  }
}

function fileFrom(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  return file
}

async function changePhoto(event: Event) {
  const file = fileFrom(event)
  if (file) await setPhoto(file)
}

async function choosePhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  if (files.length === 1 && !batch.value.length) {
    await setPhoto(files[0]!)
    return
  }
  const version = ++photoVersion
  error.value = ''
  processing.value = true
  replacingPhoto.value = true
  const start = batch.value.length
  const controller = new AbortController()
  analysis.value = controller
  batch.value.push(...files.map(file => ({ file, category: category.value, tags: [] })))
  try {
    for (const row of batch.value.slice(start)) {
      if (version !== photoVersion) return
      try {
        row.photo = await cropPhoto(row.file, defaultCrop())
      } catch (cause) {
        row.error = (cause as Error).message
        continue
      }
      const suggestion = await suggestPhoto(row.file, controller.signal)
      if (version !== photoVersion) return
      if (!suggestion) continue
      row.notes = suggestion.notes
      row.category = suggestion.category || row.category
      row.tags = suggestion.tags
      if (suggestion.cutout) {
        try {
          const transparent = await cropPhoto(suggestion.cutout, defaultCrop())
          if (controller.signal.aborted) continue
          row.originalPreview = row.photo
          row.cutout = suggestion.cutout
          row.photo = transparent
        } catch {
          row.notes.push('투명 사진을 만들지 못해 원본을 사용했어요.')
        }
      }
    }
  } finally {
    if (version === photoVersion) {
      analysis.value = undefined
      processing.value = false
      replacingPhoto.value = false
    }
  }
}

async function adjustCrop() {
  const file = cutout.value ?? original.value
  if (!file || replacingPhoto.value) return
  const version = ++photoVersion
  const nextCrop = { ...crop.value }
  processing.value = true
  photoError.value = ''
  try {
    const result = await cropPhoto(file, nextCrop)
    if (version === photoVersion) {
      photo.value = result
      appliedCrop.value = nextCrop
    }
  } catch (cause) {
    if (version === photoVersion) {
      crop.value = { ...appliedCrop.value }
      photoError.value = (cause as Error).message
    }
  } finally {
    if (version === photoVersion) processing.value = false
  }
}

async function useOriginalPhoto() {
  if (!original.value) return
  const source = cutout.value
  const version = photoVersion + 1
  cutout.value = undefined
  await adjustCrop()
  if (version === photoVersion && photoError.value) cutout.value = source
}

async function commit(action: () => Promise<void>, success: string, next?: () => void) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
    notice.value = success
  } catch {
    error.value = '변경사항을 저장하지 못했어요. 기기의 저장 공간을 확인하고 다시 시도해 주세요.'
    return
  } finally {
    busy.value = false
  }
  next?.()
}

async function saveItem() {
  if (processing.value) return
  if (!original.value || !photo.value || !category.value) {
    error.value = '사진과 품목 종류를 선택해 주세요.'
    return
  }
  const existing = items.value.find(item => item.id === editId.value)
  const now = Date.now()
  const item: Item = { id: existing?.id ?? crypto.randomUUID(), category: category.value, name: name.value.trim(),
    tags: [...selectedTags.value], original: original.value, cutout: cutout.value, photo: photo.value, crop: { ...appliedCrop.value },
    created: existing?.created ?? now, modified: now }
  await commit(async () => {
    await write('items', item.id, item)
    items.value = existing ? items.value.map(old => old.id === item.id ? item : old) : [item, ...items.value]
    if (trail.value.at(-1) === 'wardrobe' && filter.value !== 'all') filter.value = item.category
  }, '옷장에 저장했어요.', () => {
    if (session.value && !session.value.total) recommend(recommendedSituation.value)
    back()
  })
}

async function saveBatch() {
  if (processing.value || !batch.value.length) return
  const now = Date.now()
  const entries: Item[] = []
  for (const row of batch.value) {
    if (!row.photo || !row.category) {
      error.value = '모든 사진의 종류를 선택하고, 열 수 없는 사진은 목록에서 빼 주세요.'
      return
    }
    entries.push({ id: crypto.randomUUID(), category: row.category, name: '', tags: [...row.tags],
      original: row.file, cutout: row.cutout, photo: row.photo, crop: defaultCrop(), created: now, modified: now })
  }
  await commit(async () => {
    await writeItems(entries)
    items.value = [...entries, ...items.value]
    filter.value = 'all'
  }, `옷 ${entries.length}벌을 저장했어요.`, () => {
    if (session.value && !session.value.total) recommend(recommendedSituation.value)
    back()
  })
}

async function deleteItem() {
  const id = editId.value
  if (!id || !window.confirm('이 옷과 사진을 삭제할까요? 저장 코디에는 삭제된 품목으로 표시돼요.')) return
  await commit(async () => {
    await remove('items', id)
    items.value = items.value.filter(item => item.id !== id)
  }, '옷장에서 삭제했어요.', back)
}

function startRecommendations() {
  recommendedSituation.value = ''
  started.value = false
  session.value = undefined
  show('recommend')
  if (missingCategories.value.length) recommend('')
}

function recommend(tag: Tag | '') {
  recommendedSituation.value = tag
  index.value = 0
  session.value = recommendation(items.value, tag)
  started.value = true
}

function startManual(look?: Look, kind?: Category) {
  situation.value = look?.situation ?? ''
  selection.value = look ? { ...look.ids } : emptySelection()
  show('manual')
  if (kind) nextTick(() => document.getElementById('manual-' + kind)?.scrollIntoView({ block: 'center' }))
}

function changeManualItem(row: typeof manualRows.value[number], direction: -1 | 1) {
  const next = (row.index + direction + row.options.length) % row.options.length
  const item = row.options[next]
  if (item) selection.value[row.kind] = item.id
}

function openPreview(look: Look | SavedLook) {
  preview.value = look
  show('preview')
}

async function saveLook(look: Look) {
  if (!resolveItems(items.value, look.ids).every(({ item }) => item)) {
    error.value = '상의, 하의, 신발을 모두 선택해 주세요.'
    return
  }
  const entry: SavedLook = { ...look, ids: { ...look.ids }, id: crypto.randomUUID(), saved: Date.now() }
  await commit(async () => {
    await write('looks', entry.id, entry)
    saved.value = [entry, ...saved.value]
    if (screen.value === 'preview') preview.value = entry
  }, '코디를 저장했어요.')
}

async function deleteLook(id: string) {
  if (!window.confirm('저장 코디를 삭제할까요?')) return
  await commit(async () => {
    await remove('looks', id)
    saved.value = saved.value.filter(look => look.id !== id)
  }, '저장 코디를 삭제했어요.', () => show('saved', true))
}

const lookDate = (date: number) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
</script>

<template>
  <header class="site-header">
    <div class="frame header-inner">
      <button type="button" class="brand" @click="show('home', true)">
        <span class="brand-icon"><Shirt :size="19" /></span> 오늘의 옷장
      </button>
    </div>
  </header>

  <main ref="main" class="frame content" tabindex="-1">
    <div v-if="loadError" role="alert" class="empty">
      <p>{{ loadError }}</p><button class="button small" @click="initialize">다시 시도</button>
    </div>
    <p v-else-if="!ready" role="status">옷장을 여는 중이에요…</p>
    <template v-else>
      <p v-if="notice" class="notification" role="status">
        {{ notice }} <button aria-label="알림 닫기" @click="notice = ''">×</button>
      </p>
      <button v-if="trail.length" type="button" class="back" @click="back"><ArrowLeft :size="17" /> 뒤로</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <template v-if="screen === 'home'">
        <section class="hero">
          <div class="hero-copy">
            <span class="hero-kicker"><Sparkles :size="14" /> 내 옷으로 만드는 스타일</span>
            <h1>오늘 뭐<br>입지?</h1>
            <p>옷장 속 익숙한 옷으로<br>새로운 조합을 발견해 보세요.</p>
            <button class="button" @click="startRecommendations">오늘의 코디 추천받기 <ArrowRight :size="18" /></button>
          </div>
        </section>
        <div class="home-grid">
          <section>
            <div class="section-heading"><h2>코디 시작하기</h2></div>
            <button class="feature" @click="startManual()">
              <span class="feature-icon peach"><Layers3 :size="23" /></span>
              <span><strong>직접 코디하기</strong><small>옷장에서 마음에 드는 조합을 골라보세요.</small></span>
              <ChevronRight :size="19" class="chevron" />
            </button>
          </section>
          <section>
            <div class="section-heading"><h2>내 옷장</h2><button class="text-button" @click="show('wardrobe', true)">옷장 보기 <ChevronRight :size="16" /></button></div>
            <div class="closet-summary">
              <div class="feature-icon rosy"><Shirt :size="24" /></div>
              <div><strong>{{ items.length ? '등록한 옷 ' + items.length + '벌' : '첫 옷을 등록해 보세요' }}</strong>
                <p>{{ items.length ? '내 옷으로 오늘 입을 코디를 만들어 보세요.' : '상의, 하의, 신발을 한 벌씩 담아보세요.' }}</p>
              </div>
              <button class="button outline small" @click="openItem()"><Plus :size="17" /> 옷 추가</button>
            </div>
          </section>
        </div>
        <section v-if="recent.length">
          <div class="section-heading"><h2>최근 저장한 코디</h2><button class="text-button" @click="savedFilter = 'all'; show('saved', true)">모두 보기 <ChevronRight :size="16" /></button></div>
          <div class="saved-list recent-list">
            <article v-for="look in recent" :key="look.id" class="saved-entry">
              <h3><button class="saved-entry-open" @click="openPreview(look)">{{ look.situation || '나의 코디' }}
                <ChevronRight :size="18" aria-hidden="true" />
              </button></h3>
              <LookCard :items="items" :look="look" vertical photo-first />
            </article>
          </div>
        </section>
        <p class="privacy">옷 사진과 코디는 이 브라우저에 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 복구가 어려울 수 있어요.</p>
      </template>

      <section v-else-if="screen === 'wardrobe'">
        <div class="section-heading page-heading">
          <div><h1>내 옷장</h1><p>등록한 옷 {{ items.length }}벌</p></div>
          <button class="button" @click="openItem(undefined, filter === 'all' ? undefined : filter)"><Plus :size="20" /> 옷 추가</button>
        </div>
        <div class="chips" aria-label="품목 필터">
          <button class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">전체</button>
          <button v-for="kind in categories" :key="kind" class="chip" :aria-pressed="filter === kind" @click="filter = kind">{{ labels[kind] }}</button>
        </div>
        <div v-if="!wardrobe.length" class="empty">
          <Shirt :size="33" /><h2>{{ items.length ? '이 종류에 등록한 옷이 없어요' : '옷장이 비어 있어요' }}</h2>
          <button class="button outline" @click="openItem(undefined, filter === 'all' ? undefined : filter)">옷 등록하기</button>
        </div>
        <div v-else class="wardrobe-grid">
          <button v-for="item in wardrobe" :key="item.id" class="piece" @click="openItem(item)">
            <BlobPhoto :blob="outfitPhoto(item)" :alt="item.name || labels[item.category]" />
            <span>{{ labels[item.category] }}</span><strong>{{ item.name || labels[item.category] }}</strong>
          </button>
        </div>
      </section>

      <section v-else-if="screen === 'item'" class="narrow">
        <h1>{{ editId ? '옷 수정' : '옷 등록' }}</h1>
        <div v-if="analysis && !analysis.signal.aborted" class="inline-hint" role="status">
          배경과 품목을 확인하고 있어요. 처음에는 모델을 내려받느라 시간이 걸릴 수 있어요.
          <button type="button" class="text-button" @click="analysis.abort()">직접 입력하기</button>
        </div>
        <form v-if="batch.length" class="form-stack" @submit.prevent="saveBatch">
          <p class="hint">사진마다 종류와 상황 태그를 확인하세요. 별칭과 사진 자르기는 등록 후 옷장에서 수정할 수 있어요.</p>
          <p v-if="processing" class="hint" role="status">사진을 처리하고 있어요…</p>
          <fieldset v-for="(row, i) in batch" :key="row.file.name + ':' + i" :disabled="busy || processing">
            <legend>사진 {{ i + 1 }}</legend>
            <BlobPhoto v-if="row.photo" class="batch-preview" :blob="row.photo" :alt="row.file.name" />
            <p v-if="row.error" class="error" role="alert">{{ row.file.name }} · {{ row.error }}</p>
            <p v-for="note in row.notes" :key="note" class="hint">{{ note }}</p>
            <button v-if="row.cutout" class="text-button" type="button" @click="row.photo = row.originalPreview; row.cutout = undefined">원본 배경 사용</button>
            <label class="field">품목 종류
              <select v-model="row.category" required :aria-label="'사진 ' + (i + 1) + ' 품목 종류'">
                <option value="" disabled>종류 선택</option>
                <option v-for="kind in categories" :key="kind" :value="kind">{{ labels[kind] }}</option>
              </select>
            </label>
            <div class="chips" :aria-label="'사진 ' + (i + 1) + ' 상황 태그'">
              <label v-for="tag in tags" :key="tag" class="chip tag"><input v-model="row.tags" type="checkbox" :value="tag">{{ tag }}</label>
            </div>
            <button class="text-button" type="button" :aria-label="'사진 ' + (i + 1) + ' 제외'" @click="batch.splice(i, 1)">목록에서 빼기</button>
          </fieldset>
          <div class="actions uploads">
            <label class="button outline small"><ImagePlus :size="18" /> 사진 더 선택<input class="file-input" aria-label="사진 더 선택" type="file" accept="image/*" multiple :disabled="busy || processing" @change="choosePhotos"></label>
            <button class="button" type="submit" :disabled="busy || processing">옷 {{ batch.length }}벌 한 번에 저장</button>
          </div>
        </form>
        <form v-else class="form-stack" @submit.prevent="saveItem">
          <fieldset :disabled="busy || replacingPhoto">
            <legend>옷 사진</legend>
            <BlobPhoto v-if="photo" class="crop-preview" :blob="photo" alt="저장할 옷 사진 미리보기" />
            <div class="actions uploads">
              <label class="button outline small"><ImagePlus :size="18" /> 사진 보관함<input class="file-input" aria-label="사진 보관함" type="file" accept="image/*" :multiple="!editId && !photo" @change="choosePhotos"></label>
              <label class="button outline small"><Camera :size="18" /> 카메라<input class="file-input" aria-label="카메라" type="file" accept="image/*" capture="environment" @change="changePhoto"></label>
              <button v-if="photo" class="button outline small" type="button" :aria-expanded="cropping" @click="cropping = !cropping">{{ cropping ? '자르기 닫기' : '사진 자르기' }}</button>
              <button v-if="cutout" class="text-button" type="button" :disabled="processing" @click="useOriginalPhoto">원본 배경 사용</button>
            </div>
            <p class="hint">{{ shareHint || '공유 메뉴에서 앱이 보이지 않으면 사진을 저장한 뒤 보관함에서 선택해 주세요.' }}</p>
            <p v-if="!editId && !photo" class="hint">보관함에서 여러 장을 선택하면 한 번에 등록할 수 있어요.</p>
            <p class="hint">카메라나 사진 보관함이 열리지 않으면 기기의 접근 권한을 확인하거나 다른 사진 입력 방법을 사용해 주세요.</p>
            <p v-if="processing" class="hint" role="status">사진을 처리하고 있어요…</p>
            <p v-if="photoError" class="error" role="alert">{{ photoError }}</p>
            <p v-for="note in photoNotes" :key="note" class="hint">{{ note }}</p>
            <div v-if="cropping" class="crop-controls">
              <label>확대 <input v-model.number="crop.zoom" type="range" min="1" max="3" step=".05" @input="adjustCrop"></label>
              <label>가로 위치 <input v-model.number="crop.x" type="range" min="0" max="100" @input="adjustCrop"></label>
              <label>세로 위치 <input v-model.number="crop.y" type="range" min="0" max="100" @input="adjustCrop"></label>
            </div>
          </fieldset>
          <fieldset :disabled="busy"><legend>품목 종류</legend>
            <div class="chips"><button v-for="kind in categories" :key="kind" type="button" class="chip" :aria-pressed="category === kind" @click="category = kind">{{ labels[kind] }}</button></div>
          </fieldset>
          <label class="field">별칭 <span>선택</span><input v-model="name" :disabled="busy" maxlength="40" placeholder="예: 아이보리 니트"></label>
          <fieldset :disabled="busy"><legend>상황 태그 <span>선택</span></legend>
            <div class="chips">
              <label v-for="tag in tags" :key="tag" class="chip tag"><input v-model="selectedTags" type="checkbox" :value="tag">{{ tag }}</label>
            </div>
          </fieldset>
          <div class="actions"><button class="button" :disabled="busy || processing" type="submit">옷 저장하기</button>
            <button v-if="editId" class="button outline danger" type="button" :disabled="busy" @click="deleteItem">삭제</button>
          </div>
        </form>
      </section>

      <section v-else-if="screen === 'recommend'" class="narrow">
        <h1>코디 추천</h1>
        <div v-if="!started" class="panel">
          <h2>어디에 입고 가나요?</h2><p>상황을 골라 옷장 속 코디를 찾아보세요.</p>
          <div class="chips"><button v-for="tag in tags" :key="tag" class="chip" @click="recommend(tag)">{{ tag }}</button></div>
          <button class="button outline" @click="recommend('')">상황 선택 안 함 <ArrowRight :size="17" /></button>
        </div>
        <div v-else-if="suggested" class="panel">
          <p class="hint">{{ recommendedSituation || '전체 옷장' }} · {{ index + 1 }} / {{ session?.total }}</p>
          <LookCard :items="items" :look="suggested" />
          <div class="actions">
            <button class="button" @click="index++">다른 코디 보기 <ArrowRight :size="17" /></button>
            <button class="button outline" :disabled="busy" @click="saveLook(suggested)"><Bookmark :size="17" /> 저장하기</button>
            <button class="button outline" @click="startManual(suggested)">직접 수정하기</button>
            <button class="button outline" @click="openPreview(suggested)">미리보기</button>
          </div>
        </div>
        <div v-else class="empty">
          <Sparkles :size="30" /><h2>{{ session?.total ? '새로운 조합이 없어요' : '추천에 필요한 옷이 없어요' }}</h2>
          <p v-if="session?.missing.length">필요한 품목 · {{ session.missing.map(kind => labels[kind]).join(', ') }}</p>
          <div class="actions">
            <button v-if="recommendedSituation && !session?.total" class="button outline" @click="recommend('')">상황 없이 다시 추천</button>
            <button class="button outline" @click="startManual()">직접 코디하기</button>
            <button class="button" @click="openItem(undefined, session?.missing[0])">옷 추가</button>
          </div>
        </div>
        <button v-if="started" class="text-button extra" @click="started = false">상황 다시 선택</button>
      </section>

      <section v-else-if="screen === 'manual'" class="narrow">
        <h1>직접 코디</h1>
        <label class="field situation-field">상황 <span>선택</span>
          <select v-model="situation"><option value="">상황 선택 안 함</option><option v-for="tag in tags" :key="tag">{{ tag }}</option></select>
        </label>
        <div v-if="missingCategories.length" class="inline-hint">
          {{ missingCategories.map(kind => labels[kind]).join(', ') }}을(를) 옷장에 추가해 주세요.
          <button class="text-button" @click="openItem(undefined, missingCategories[0])">옷 추가 <ArrowRight :size="16" /></button>
        </div>
        <div class="outfit-stage">
          <section v-for="row in manualRows" :id="'manual-' + row.kind" :key="row.kind" class="outfit-row" :aria-label="labels[row.kind]">
            <button class="button outline small" :disabled="row.options.length < 2"
              :aria-label="labels[row.kind] + ' 이전'" @click="changeManualItem(row, -1)">이전</button>
            <div class="outfit-slot" :class="row.kind" aria-live="polite">
              <BlobPhoto v-if="row.item" :blob="outfitPhoto(row.item)" :alt="row.item.name || labels[row.kind]" />
              <button v-else class="button outline small" @click="openItem(undefined, row.kind)">{{ labels[row.kind] }} 추가</button>
              <small v-if="row.item">{{ row.item.name || labels[row.kind] }} · {{ row.index + 1 }} / {{ row.options.length }}</small>
            </div>
            <button class="button outline small" :disabled="row.options.length < 2"
              :aria-label="labels[row.kind] + ' 다음'" @click="changeManualItem(row, 1)">다음</button>
          </section>
          <div class="actions">
            <button class="button" :disabled="!complete" @click="openPreview(manual)">코디 미리보기 <ArrowRight :size="17" /></button>
            <button class="button" :disabled="!complete || busy" @click="saveLook(manual)"><Bookmark :size="17" /> 코디 저장</button>
          </div>
        </div>
      </section>

      <section v-else-if="screen === 'preview' && preview" class="narrow">
        <h1>코디 미리보기</h1>
        <div :class="savedPreview || preview.mode === 'manual' ? 'outfit-stage' : 'panel'">
          <p v-if="preview.situation" class="hint">{{ preview.situation }}</p>
          <p v-if="savedPreview" class="hint">저장한 날짜 · {{ lookDate(savedPreview.saved) }}</p>
          <LookCard :items="items" :look="preview" :vertical="Boolean(savedPreview) || preview.mode === 'manual'"
            :photo-first="Boolean(savedPreview)" editable @replace="startManual(preview, $event)" />
          <div class="actions">
            <button v-if="!savedPreview" class="button" :disabled="busy" @click="saveLook(preview)"><Bookmark :size="17" /> 코디 저장</button>
            <button v-else class="button outline danger" :disabled="busy" @click="deleteLook(savedPreview.id)">저장 코디 삭제</button>
          </div>
        </div>
      </section>

      <section v-else-if="screen === 'saved'" class="narrow">
        <div class="page-heading"><h1>저장 코디</h1></div>
        <div v-if="saved.length" class="chips saved-filters" role="group" aria-label="저장 코디 상황 필터">
          <button class="chip" :aria-pressed="savedFilter === 'all'" @click="savedFilter = 'all'">전체</button>
          <button v-for="tag in tags" :key="tag" class="chip" :aria-pressed="savedFilter === tag" @click="savedFilter = tag">{{ tag }}</button>
          <button class="chip" :aria-pressed="savedFilter === ''" @click="savedFilter = ''">상황 미지정</button>
        </div>
        <div v-if="!saved.length" class="empty">
          <Heart :size="32" /><h2>아직 저장한 코디가 없어요</h2>
          <div class="actions"><button class="button" @click="startRecommendations">코디 추천받기</button>
            <button class="button outline" @click="startManual()">직접 코디하기</button></div>
        </div>
        <p v-else-if="!visibleSaved.length" class="hint" role="status">이 상황에 저장한 코디가 없어요.</p>
        <div v-else class="saved-list">
          <article v-for="look in visibleSaved" :key="look.id" class="saved-entry">
            <h2><button class="saved-entry-open" @click="openPreview(look)">{{ look.situation || '나의 코디' }}
              <ChevronRight :size="18" aria-hidden="true" />
            </button></h2>
            <LookCard :items="items" :look="look" vertical photo-first />
          </article>
        </div>
      </section>

    </template>
  </main>

  <nav class="bottom-nav" aria-label="주 메뉴">
    <div class="nav-inner">
      <button v-for="entry in nav" :key="entry.id" :aria-current="screen === entry.id ? 'page' : undefined"
        :disabled="!ready" @click="show(entry.id, true)">
        <component :is="entry.icon" :size="21" /> {{ entry.label }}
      </button>
    </div>
  </nav>
</template>
