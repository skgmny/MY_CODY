import type { Category, Tag } from './outfits'

const garments: Record<string, Category | ''> = {
  'a shirt, blouse, sweater, or jacket': 'top',
  'pants, jeans, shorts, or a skirt': 'bottom',
  'shoes, sneakers, boots, or sandals': 'shoes',
  'a person wearing a complete outfit': '',
  'multiple clothing items': '',
  'an object that is not clothing': '',
}
const styles: Record<string, Tag | ''> = {
  'a tracksuit, workout leggings, running shoes, or other activewear': '운동',
  'a tailored suit, dress shirt, formal skirt, or dress shoes': '격식 있는 자리',
  'a casual knit sweater, T-shirt, jeans, or everyday shoes': '일상',
  'a costume, uniform, or specialized clothing': '',
}
export const photoLabels = [...Object.keys(garments), ...Object.keys(styles)]

export function photoSuggestions(scores: { label: string; score: number }[]) {
  function confidentLabel(labels: Record<string, string>, threshold: number) {
    const ranked = scores.filter(result => Object.hasOwn(labels, result.label))
      .sort((a, b) => b.score - a.score)
    const [first, second] = ranked
    if (!first || !second) return ''
    const total = ranked.reduce((sum, result) => sum + result.score, 0)
    if (!total || first.score / total < threshold || (first.score - second.score) / total < 0.12) return ''
    return first.label
  }
  const category = garments[confidentLabel(garments, 0.52)] ?? ''
  const tag = category ? styles[confidentLabel(styles, 0.5)] : undefined
  return { category, tags: tag ? [tag] : [] }
}
