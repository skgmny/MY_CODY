export type Crop = { zoom: number; x: number; y: number }
export const defaultCrop = (): Crop => ({ zoom: 1, x: 50, y: 50 })

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
  const size = Math.min(image.naturalWidth, image.naturalHeight) / crop.zoom
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(960, Math.max(1, Math.round(size)))
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, (image.naturalWidth - size) * crop.x / 100, (image.naturalHeight - size) * crop.y / 100,
    size, size, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('사진을 자르지 못했어요. 다시 시도해 주세요.')), 'image/jpeg', 0.88,
  ))
}

export async function validateWear(file: Blob) {
  if (file.type !== 'image/png') throw new Error('착용용 이미지는 투명 배경 PNG를 선택해 주세요.')
  const image = await decodeImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, 192, 192)
  const pixels = context.getImageData(0, 0, 192, 192).data
  let transparent = false
  let visible = false
  for (let i = 3; i < pixels.length; i += 4) {
    transparent ||= pixels[i] === 0
    visible ||= pixels[i]! > 0
    if (transparent && visible) return
  }
  throw new Error('옷이 보이고 배경이 투명한 PNG를 선택해 주세요.')
}
