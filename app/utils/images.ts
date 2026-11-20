export type Crop = { zoom: number; x: number; y: number }
export type PhotoBounds = { left: number; top: number; right: number; bottom: number }
export const photoUploadLimit = 10
export const fullPhotoBounds = (): PhotoBounds => ({ left: 0, top: 0, right: 100, bottom: 100 })
export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export function resizePhotoBounds(bounds: PhotoBounds, handle: CropHandle, dx: number, dy: number): PhotoBounds {
  const next = { ...bounds }
  if (handle.includes('w')) next.left = Math.max(0, Math.min(bounds.right - 5, bounds.left + dx))
  if (handle.includes('e')) next.right = Math.min(100, Math.max(bounds.left + 5, bounds.right + dx))
  if (handle.includes('n')) next.top = Math.max(0, Math.min(bounds.bottom - 5, bounds.top + dy))
  if (handle.includes('s')) next.bottom = Math.min(100, Math.max(bounds.top + 5, bounds.bottom + dy))
  return next
}

export function fitsPhotoUpload(existing: number, added: number, limit = photoUploadLimit) {
  return added > 0 && existing + added <= limit
}

export function selectedPhotoBounds(bounds: PhotoBounds) {
  return bounds.left || bounds.top || bounds.right !== 100 || bounds.bottom !== 100 ? { ...bounds } : undefined
}
export const defaultCrop = (): Crop => ({ zoom: 1, x: 50, y: 50 })

export function photoCropRect(width: number, height: number, crop: Crop, bounds = fullPhotoBounds()) {
  const regionWidth = width * (bounds.right - bounds.left) / 100
  const regionHeight = height * (bounds.bottom - bounds.top) / 100
  const croppedWidth = regionWidth / crop.zoom
  const croppedHeight = regionHeight / crop.zoom
  return {
    x: width * bounds.left / 100 + (regionWidth - croppedWidth) * crop.x / 100,
    y: height * bounds.top / 100 + (regionHeight - croppedHeight) * crop.y / 100,
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

export async function cropPhoto(file: Blob, crop: Crop, bounds?: PhotoBounds) {
  const image = await decodeImage(file)
  const rect = photoCropRect(image.naturalWidth, image.naturalHeight, crop, bounds)
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

export function transparentPhoto(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('투명 사진을 만들지 못했어요.')), 'image/webp', 0.9,
  ))
}

export async function cutoutPreview(canvas: HTMLCanvasElement, checkCoverage = false) {
  const { width, height } = canvas
  const alpha = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
  let left = width, top = height, right = 0, bottom = 0, foreground = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3]! < 110) continue
      foreground++
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (!foreground) throw new Error('사진에 남긴 부분이 없어요. 복원 도구로 옷을 다시 살려 주세요.')
  const ratio = foreground / (width * height)
  if (checkCoverage && (ratio < 0.02 || ratio > 0.95)) throw new Error('배경을 구분하지 못했어요.')
  const cropWidth = right - left + 1
  const cropHeight = bottom - top + 1
  const result = document.createElement('canvas')
  result.width = result.height = Math.ceil(Math.max(cropWidth, cropHeight) * 1.08)
  result.getContext('2d')!.drawImage(canvas, (result.width - cropWidth) / 2 - left, (result.height - cropHeight) / 2 - top)
  return await transparentPhoto(result)
}
