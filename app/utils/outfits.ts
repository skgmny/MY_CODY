import type { Crop, PhotoBounds } from './images'

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
  useCutout?: boolean
  photo: Blob
  crop?: Crop
  sourceBounds?: PhotoBounds
  created: number
  modified: number
}
export type Look = { ids: Selection; situation: Tag | ''; mode: 'recommend' | 'manual' }
export type SavedLook = Look & { id: string; saved: number }

export function outfitPhoto(item: Pick<Item, 'original' | 'cutout' | 'useCutout' | 'photo' | 'crop' | 'sourceBounds'>) {
  const crop = item.crop
  if (item.sourceBounds || (crop && (crop.zoom !== 1 || crop.x !== 50 || crop.y !== 50))) return item.photo
  if (item.cutout && item.useCutout === false) return item.photo
  return item.cutout ?? item.original
}

export function recommendation<T extends Pick<Item, 'id' | 'category' | 'tags'>>(
  items: T[],
  situation: Tag | '',
  random = Math.random,
) {
  const groups = categories.map(category => {
    const group = items.filter(item => item.category === category)
    if (!situation) return group
    const matching = group.filter(item => item.tags.includes(situation))
    return matching.length ? matching : group.filter(item => !item.tags.length)
  })
  const [tops = [], bottoms = [], shoes = []] = groups
  const total = tops.length * bottoms.length * shoes.length
  const drawn: number[] = []
  // Shuffle only as combinations are requested, even for large wardrobes.
  const swaps = new Map<number, number>()
  return {
    total,
    missing: categories.filter((_, index) => !groups[index]?.length),
    at(index: number): Selection | undefined {
      if (!Number.isSafeInteger(index) || index < 0 || index >= total) return
      while (drawn.length <= index) {
        const last = total - drawn.length - 1
        const slot = Math.floor(random() * (last + 1))
        drawn.push(swaps.get(slot) ?? slot)
        if (slot !== last) swaps.set(slot, swaps.get(last) ?? last)
        swaps.delete(last)
      }
      const combination = drawn[index]!
      return {
        top: tops[Math.floor(combination / (bottoms.length * shoes.length))]!.id,
        bottom: bottoms[Math.floor(combination / shoes.length) % bottoms.length]!.id,
        shoes: shoes[combination % shoes.length]!.id,
      }
    },
  }
}

export function orderedItems(items: Item[], category: Category, situation: Tag | '', eligibleIds?: ReadonlySet<string>) {
  const priority = (item: Item) => Number(Boolean(situation && item.tags.includes(situation)))
  return items.filter(item => item.category === category && (!eligibleIds || eligibleIds.has(item.id)))
    .sort((a, b) => priority(b) - priority(a))
}

export function resolveItems<T extends Pick<Item, 'id'>>(items: T[], ids: Selection) {
  return categories.map(category => ({ category, item: items.find(item => item.id === ids[category]) }))
}
