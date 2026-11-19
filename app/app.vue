<script setup lang="ts">
import { ArrowDown, ArrowLeft, ArrowRight, Bookmark, Camera, ChevronRight, Heart, House, ImagePlus,
  Layers3, Plus, ScanLine, Shirt, Sparkles, Upload, UserRound } from 'lucide-vue-next'
import { avatarShape, categories, labels, orderedItems, recommendation, resolveItems, tags,
  type Avatar, type Category, type Item, type Look, type SavedLook, type Selection, type Tag } from '~/utils/outfits'
import { read, readAll, remove, write } from '~/utils/storage'
import { cropPhoto, defaultCrop, validateWear } from '~/utils/images'

type Screen = 'home' | 'wardrobe' | 'item' | 'recommend' | 'manual' | 'preview' | 'saved' | 'avatar'
const nav = [{ id: 'home', label: '홈', icon: House }, { id: 'wardrobe', label: '내 옷장', icon: Shirt },
  { id: 'saved', label: '저장 코디', icon: Bookmark }] as const
const titles: Record<Screen, string> = {
  home: '홈', wardrobe: '내 옷장', item: '옷 등록', recommend: '코디 추천', manual: '직접 코디',
  preview: '코디 미리보기', saved: '저장 코디', avatar: '아바타 설정',
}
const screen = ref<Screen>('home')
const trail = ref<Screen[]>([])
const main = ref<HTMLElement>()
const items = shallowRef<Item[]>([])
const saved = shallowRef<SavedLook[]>([])
const avatar = shallowRef<Avatar>()
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
const photo = shallowRef<Blob>()
const wear = shallowRef<Blob>()
const crop = ref(defaultCrop())
const cropping = ref(false)
const processing = ref(false)
const checkingWear = ref(false)
let photoVersion = 0
let wearVersion = 0
const shareHint = ref('')
const recommendedSituation = ref<Tag | ''>('')
const situation = ref<Tag | ''>('')
const index = ref(0)
const started = ref(false)
const session = shallowRef<ReturnType<typeof recommendation<Item>>>()
const emptySelection = (): Selection => ({ top: '', bottom: '', shoes: '' })
const selection = ref(emptySelection())
const activeCategory = ref<Category>('top')
const preview = shallowRef<Look | SavedLook>()
const wearing = ref(false)
const avatarReturn = ref<Screen>('home')
const height = ref<string | number>('')
const weight = ref<string | number>('')

const recent = computed(() => saved.value.slice(0, 3))
const wardrobe = computed(() => items.value.filter(item => filter.value === 'all' || item.category === filter.value))
const currentIds = computed(() => session.value?.at(index.value))
const suggested = computed<Look | undefined>(() => currentIds.value
  ? { ids: currentIds.value, situation: recommendedSituation.value, mode: 'recommend' } : undefined)
const manual = computed<Look>(() => ({ ids: { ...selection.value }, situation: situation.value, mode: 'manual' }))
const manualOptions = computed(() => orderedItems(items.value, activeCategory.value, situation.value))
const complete = computed(() => resolveItems(items.value, selection.value).every(({ item }) => item))
const missingCategories = computed(() => categories.filter(kind => !items.value.some(item => item.category === kind)))
const pieces = computed(() => preview.value ? resolveItems(items.value, preview.value.ids) : [])
const missingWear = computed(() => pieces.value.filter(({ item }) => !item?.wear).map(({ category }) => labels[category]))
const savedPreview = computed(() => preview.value && 'id' in preview.value ? preview.value : undefined)
const draftShape = computed(() => avatarShape(Number(height.value), Number(weight.value)))
const savedShape = computed(() => avatar.value && avatarShape(avatar.value.height, avatar.value.weight))

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
    const [clothes, looks, profile] = await Promise.all([readAll('items'), readAll('looks'), read('settings', 'avatar')])
    items.value = clothes.sort((a, b) => b.created - a.created)
    saved.value = looks.sort((a, b) => b.saved - a.saved)
    avatar.value = profile
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
  photoVersion++
  wearVersion++
  processing.value = false
  checkingWear.value = false
  editId.value = item?.id ?? ''
  category.value = item?.category ?? kind ?? ''
  name.value = item?.name ?? ''
  selectedTags.value = [...(item?.tags ?? [])]
  original.value = item?.original
  photo.value = item?.photo
  wear.value = item?.wear
  crop.value = item?.crop ? { ...item.crop } : defaultCrop()
  cropping.value = false
  shareHint.value = ''
  show('item')
}

async function setPhoto(file: Blob) {
  const version = ++photoVersion
  const defaults = defaultCrop()
  processing.value = true
  error.value = ''
  try {
    const result = await cropPhoto(file, defaults)
    if (version !== photoVersion) return
    original.value = file
    crop.value = defaults
    photo.value = result
    cropping.value = false
  } catch (cause) {
    if (version === photoVersion) error.value = (cause as Error).message
  } finally {
    if (version === photoVersion) processing.value = false
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

async function changeWear(event: Event) {
  const file = fileFrom(event)
  if (!file) return
  const version = ++wearVersion
  checkingWear.value = true
  error.value = ''
  try {
    await validateWear(file)
    if (version === wearVersion) wear.value = file
  } catch (cause) {
    if (version === wearVersion) error.value = (cause as Error).message
  } finally {
    if (version === wearVersion) checkingWear.value = false
  }
}

async function adjustCrop() {
  const file = original.value
  if (!file) return
  const version = ++photoVersion
  processing.value = true
  error.value = ''
  try {
    const result = await cropPhoto(file, { ...crop.value })
    if (version === photoVersion) photo.value = result
  } catch (cause) {
    if (version === photoVersion) error.value = (cause as Error).message
  } finally {
    if (version === photoVersion) processing.value = false
  }
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
  if (processing.value || checkingWear.value) return
  if (!original.value || !photo.value || !category.value) {
    error.value = '사진과 품목 종류를 선택해 주세요.'
    return
  }
  const existing = items.value.find(item => item.id === editId.value)
  const now = Date.now()
  const item: Item = { id: existing?.id ?? crypto.randomUUID(), category: category.value, name: name.value.trim(),
    tags: [...selectedTags.value], original: original.value, photo: photo.value, crop: { ...crop.value }, wear: wear.value,
    created: existing?.created ?? now, modified: now }
  await commit(async () => {
    await write('items', item.id, item)
    items.value = existing ? items.value.map(old => old.id === item.id ? item : old) : [item, ...items.value]
    filter.value = 'all'
  }, '옷장에 저장했어요.', () => {
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

function startManual(look?: Look, kind: Category = 'top') {
  situation.value = look?.situation ?? ''
  selection.value = look ? { ...look.ids } : emptySelection()
  activeCategory.value = kind
  show('manual')
}

function openPreview(look: Look | SavedLook, showAvatar = false) {
  preview.value = look
  wearing.value = showAvatar
  show('preview')
  if (showAvatar && !avatar.value) openAvatar('preview')
}

function openAvatar(returnTo: Screen) {
  if (returnTo === 'avatar') return
  avatarReturn.value = returnTo
  height.value = avatar.value?.height ?? ''
  weight.value = avatar.value?.weight ?? ''
  show('avatar')
}

function toggleAvatar() {
  wearing.value = true
  if (!avatar.value) openAvatar('preview')
}

async function saveAvatar() {
  if (!draftShape.value) {
    error.value = '키와 몸무게에 0보다 큰 숫자를 입력해 주세요.'
    return
  }
  const profile = { height: Number(height.value), weight: Number(weight.value), modified: Date.now() }
  await commit(async () => {
    await write('settings', 'avatar', profile)
    avatar.value = profile
  }, '아바타를 저장했어요.', () => {
    if (trail.value.at(-1) === avatarReturn.value) back()
    else show(avatarReturn.value, true)
  })
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
      <button v-if="ready" type="button" class="icon-button profile" aria-label="아바타 설정" @click="openAvatar(screen)">
        <UserRound :size="20" />
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
            <button class="feature" @click="openAvatar('home')">
              <span class="feature-icon lilac"><ScanLine :size="23" /></span>
              <span><strong>{{ avatar ? '내 아바타 수정하기' : '내 아바타 만들기' }}</strong><small>2D 아바타로 착용 모습을 확인해요.</small></span>
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
          <div class="section-heading"><h2>최근 저장한 코디</h2><button class="text-button" @click="show('saved', true)">모두 보기 <ChevronRight :size="16" /></button></div>
          <div class="saved-grid">
            <article v-for="look in recent" :key="look.id" class="panel">
              <LookCard :items="items" :look="look" />
              <button class="text-button" @click="openPreview(look)">{{ look.situation || '나의 코디' }} 보기 <ArrowRight :size="16" /></button>
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
            <BlobPhoto :blob="item.photo" :alt="item.name || labels[item.category]" />
            <span>{{ labels[item.category] }}</span><strong>{{ item.name || labels[item.category] }}</strong>
          </button>
        </div>
      </section>

      <section v-else-if="screen === 'item'" class="narrow">
        <h1>{{ editId ? '옷 수정' : '옷 등록' }}</h1>
        <form class="form-stack" @submit.prevent="saveItem">
          <fieldset :disabled="busy">
            <legend>옷 사진</legend>
            <BlobPhoto v-if="photo" class="crop-preview" :blob="photo" alt="저장할 옷 사진 미리보기" />
            <div class="actions uploads">
              <label class="button outline small"><ImagePlus :size="18" /> 사진 보관함<input class="file-input" aria-label="사진 보관함" type="file" accept="image/*" @change="changePhoto"></label>
              <label class="button outline small"><Camera :size="18" /> 카메라<input class="file-input" aria-label="카메라" type="file" accept="image/*" capture="environment" @change="changePhoto"></label>
              <button v-if="photo" class="button outline small" type="button" :aria-expanded="cropping" @click="cropping = !cropping">{{ cropping ? '자르기 닫기' : '사진 자르기' }}</button>
            </div>
            <p class="hint">{{ shareHint || '공유 메뉴에서 앱이 보이지 않으면 사진을 저장한 뒤 보관함에서 선택해 주세요.' }}</p>
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
          <fieldset :disabled="busy"><legend>아바타 착용 이미지 <span>선택</span></legend>
            <p class="hint">배경을 투명하게 만든 PNG를 추가하면 아바타에서 입혀볼 수 있어요.</p>
            <BlobPhoto v-if="wear" class="wear-preview" :blob="wear" alt="착용 이미지 미리보기" />
            <div class="actions uploads">
              <label class="button outline small"><Upload :size="17" /> PNG 선택<input class="file-input" aria-label="착용용 PNG 선택" type="file" accept="image/png" @change="changeWear"></label>
              <button v-if="wear" type="button" class="text-button" :disabled="checkingWear" @click="wear = undefined">착용 이미지 제거</button>
            </div>
          </fieldset>
          <div class="actions"><button class="button" :disabled="busy || processing || checkingWear" type="submit">옷 저장하기</button>
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
            <button class="button outline" @click="openPreview(suggested, true)">아바타로 보기</button>
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
        <div class="panel">
          <LookCard :items="items" :look="manual" editable @replace="activeCategory = $event" />
          <div class="chips">
            <button v-for="kind in categories" :key="kind" class="chip" :aria-pressed="activeCategory === kind" @click="activeCategory = kind">{{ labels[kind] }}</button>
          </div>
          <div v-if="manualOptions.length" class="wardrobe-grid options">
            <button v-for="item in manualOptions" :key="item.id" class="piece" :aria-pressed="selection[activeCategory] === item.id" @click="selection[activeCategory] = item.id">
              <BlobPhoto :blob="item.photo" :alt="item.name || labels[item.category]" /><strong>{{ item.name || labels[item.category] }}</strong>
            </button>
          </div>
          <button v-else class="button outline small" @click="openItem(undefined, activeCategory)">{{ labels[activeCategory] }} 추가</button>
          <div class="actions">
            <button class="button" :disabled="!complete" @click="openPreview(manual)">코디 미리보기 <ArrowRight :size="17" /></button>
            <button class="button outline" :disabled="!complete || busy" @click="saveLook(manual)">저장하기</button>
            <button class="button outline" :disabled="!complete" @click="openPreview(manual, true)">아바타로 보기</button>
          </div>
        </div>
      </section>

      <section v-else-if="screen === 'preview' && preview" class="narrow">
        <h1>코디 미리보기</h1>
        <div class="panel">
          <p v-if="preview.situation" class="hint">{{ preview.situation }}</p>
          <div class="chips">
            <button class="chip" :aria-pressed="!wearing" @click="wearing = false">코디 카드</button>
            <button class="chip" :aria-pressed="wearing" @click="toggleAvatar">아바타로 보기</button>
          </div>
          <template v-if="wearing && savedShape">
            <AvatarFigure :shape="savedShape" :pieces="pieces" />
            <p class="hint">아바타는 코디 참고용이에요. 실제 착용 핏은 달라질 수 있어요.</p>
            <p v-if="missingWear.length" class="hint">{{ missingWear.join(', ') }}의 착용 이미지가 없어요. 옷을 수정해 투명 배경 PNG를 추가할 수 있어요.</p>
            <button class="text-button" @click="openAvatar('preview')">아바타 수정 <ChevronRight :size="17" /></button>
          </template>
          <LookCard :items="items" :look="preview" editable @replace="startManual(preview, $event)" />
          <div class="actions">
            <button v-if="!savedPreview" class="button" :disabled="busy" @click="saveLook(preview)"><Bookmark :size="17" /> 코디 저장</button>
            <button v-else class="button outline danger" :disabled="busy" @click="deleteLook(savedPreview.id)">저장 코디 삭제</button>
          </div>
        </div>
      </section>

      <section v-else-if="screen === 'saved'">
        <div class="page-heading"><h1>저장 코디</h1><p>다시 입고 싶은 조합을 모아보세요.</p></div>
        <div v-if="!saved.length" class="empty">
          <Heart :size="32" /><h2>아직 저장한 코디가 없어요</h2>
          <div class="actions"><button class="button" @click="startRecommendations">코디 추천받기</button>
            <button class="button outline" @click="startManual()">직접 코디하기</button></div>
        </div>
        <div v-else class="saved-grid">
          <article v-for="look in saved" :key="look.id" class="panel">
            <h2>{{ look.situation || '나의 코디' }}</h2><p class="hint">{{ lookDate(look.saved) }}</p>
            <LookCard :items="items" :look="look" />
            <button class="text-button extra" @click="openPreview(look)">코디 열기 <ArrowRight :size="16" /></button>
          </article>
        </div>
      </section>

      <section v-else-if="screen === 'avatar'" class="narrow">
        <h1>아바타 설정</h1>
        <p>키와 몸무게로 코디 참고용 아바타를 만들어요.</p>
        <form class="form-stack panel" novalidate @submit.prevent="saveAvatar">
          <div class="two-fields">
            <label class="field">키 (cm) <input v-model="height" type="number" inputmode="decimal" step="any" placeholder="170" required></label>
            <label class="field">몸무게 (kg) <input v-model="weight" type="number" inputmode="decimal" step="any" placeholder="60" required></label>
          </div>
          <AvatarFigure :shape="draftShape || { height: 1, width: 1 }" />
          <p class="hint">아바타는 코디 참고용이에요. 실제 착용 핏은 달라질 수 있어요. 입력한 값은 이 브라우저에만 저장돼요.</p>
          <button class="button" type="submit" :disabled="busy">아바타 저장 <ArrowDown :size="17" /></button>
        </form>
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
