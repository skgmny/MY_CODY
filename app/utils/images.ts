export type Crop = { zoom: number; x: number; y: number }
export const defaultCrop = (): Crop => ({ zoom: 1, x: 50, y: 50 })

export function photoCropRect(width: number, height: number, crop: Crop) {
  const croppedWidth = width / crop.zoom
  const croppedHeight = height / crop.zoom
  return {
    x: (width - croppedWidth) * crop.x / 100,
    y: (height - croppedHeight) * crop.y / 100,
    width: croppedWidth,
    height: croppedHeight,
  }
}

export async function decodeImage(file: Blob) {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('25MB 이하의 이미지 파일을 선택해 주세요.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } catch {
    throw new Error('이미지를 열 수 없어요. JPG, PNG 또는 WebP 파일을 선택해 주세요.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function cropPhoto(file: Blob, crop: Crop) {
  const image = await decodeImage(file)
  const rect = photoCropRect(image.naturalWidth, image.naturalHeight, crop)
  const scale = Math.min(1, 960 / Math.max(rect.width, rect.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * scale))
  canvas.height = Math.max(1, Math.round(rect.height * scale))
  const context = canvas.getContext('2d')!
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  const format = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('사진을 자르지 못했어요. 다시 시도해 주세요.')), format, 0.88,
  ))
}
