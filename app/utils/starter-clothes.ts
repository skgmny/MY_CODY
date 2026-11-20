import type { Category, Item, Tag } from './outfits'
import { addStarterItems, read, starterClothesKey } from './storage'

const starterClothes: [file: string, category: Category, name: string, tags: Tag[]][] = [
  ['khaki-hoodie', 'top', '카키 후드', []],
  ['striped-top', 'top', '스트라이프 상의', ['학교', '일상']],
  ['burgundy-top', 'top', '버건디 긴팔', ['데이트', '모임']],
  ['purple-pants', 'bottom', '보라색 바지', ['일상']],
  ['lace-skirt', 'bottom', '레이스 롱스커트', ['데이트', '모임']],
  ['blue-pants', 'bottom', '파란색 바지', []],
  ['brown-loafers', 'shoes', '갈색 로퍼', ['학교', '일상']],
  ['lined-boots', 'shoes', '회색 털부츠', []],
  ['black-heels', 'shoes', '검은색 슬링백', ['데이트', '모임']],
]

export function isStarterItem(item: Item) {
  return item.id.startsWith('starter-')
}

export async function initializeStarterClothes() {
  if (await read('setup', starterClothesKey)) return
  const items = await Promise.all(starterClothes.map(async ([file, category, name, tags]): Promise<Item> => {
    const response = await fetch(`/starter-clothes/${file}.png`)
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new Error('예시 옷 사진을 열지 못했어요.')
    const photo = await response.blob()
    return { id: `starter-${file}`, category, name, tags, original: photo, photo, created: 0, modified: 0 }
  }))
  await addStarterItems(items)
}
