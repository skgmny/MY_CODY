import type { Crop } from './images'

export const categories = ['top', 'bottom', 'shoes'] as const
export const labels = { top: '상의', bottom: '하의', shoes: '신발' }
export const tags = ['학교', '알바', '데이트', '모임', '운동', '격식 있는 자리', '일상'] as const
export type Category = typeof categories[number]
export type Tag = typeof tags[number]
export type Selection = Record<Category, string>
export type Item = {
  id: string
  category: Category
  name: string
  tags: Tag[]
  original: Blob
  cutout?: Blob
  photo: Blob
  crop?: Crop
  created: number
  modified: number
}
export type Look = { ids: Selection; situation: Tag | ''; mode: 'recommend' | 'manual' }
export type SavedLook = Look & { id: string; saved: number }

export function outfitPhoto(item: Pick<Item, 'original' | 'cutout' | 'photo' | 'crop'>) {
  const crop = item.crop
  if (crop && (crop.zoom !== 1 || crop.x !== 50 || crop.y !== 50)) return item.photo
  return item.cutout ?? item.original
}

export function recommendation<T extends Pick<Item, 'id' | 'category' | 'tags'>>(items: T[], situation: Tag | '') {
  const groups = categories.map(category => {
    const group = items.filter(item => item.category === category)
    if (!situation) return group
    const matching = group.filter(item => item.tags.includes(situation))
    return matching.length ? matching : group.filter(item => !item.tags.length)
  })
  const [tops = [], bottoms = [], shoes = []] = groups
  const total = tops.length * bottoms.length * shoes.length
  return {
    total,
    missing: categories.filter((_, index) => !groups[index]?.length),
    at(index: number): Selection | undefined {
      if (!Number.isSafeInteger(index) || index < 0 || index >= total) return
      return {
        top: tops[Math.floor(index / (bottoms.length * shoes.length))]!.id,
        bottom: bottoms[Math.floor(index / shoes.length) % bottoms.length]!.id,
        shoes: shoes[index % shoes.length]!.id,
      }
    },
  }
}

export function orderedItems(items: Item[], category: Category, situation: Tag | '') {
  const priority = (item: Item) => Number(Boolean(situation && item.tags.includes(situation)))
  return items.filter(item => item.category === category).sort((a, b) => priority(b) - priority(a))
}

export function resolveItems<T extends Pick<Item, 'id'>>(items: T[], ids: Selection) {
  return categories.map(category => ({ category, item: items.find(item => item.id === ids[category]) }))
}
