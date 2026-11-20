import type { ZeroShotImageClassificationPipeline } from '@huggingface/transformers'
import type { InferenceSession } from 'onnxruntime-web/wasm'
import wasmLoader from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import wasmBinary from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import { decodeImage } from './images'
import { photoLabels, photoSuggestions } from './photo-suggestions'

// U²-Netp by Xuebin Qin et al., Apache-2.0. ONNX weights distributed by rembg.
const modelUrl = '/models/u2netp.onnx'
const size = 320
let classifier: Promise<ZeroShotImageClassificationPipeline> | undefined
let segmenter: Promise<InferenceSession> | undefined

async function classify(file: Blob) {
  const { env, pipeline, RawImage } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  classifier ??= pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
    device: 'wasm', dtype: 'q8',
  }).catch(error => {
    classifier = undefined
    throw error
  })
  const model = await classifier
  return photoSuggestions((await model(await RawImage.fromBlob(file), photoLabels)).flat())
}

async function removeBackground(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  let transparent = 0
  for (let i = 3; i < pixels.data.length; i += 4) {
    if (pixels.data[i]! < 32) transparent++
  }
  if (transparent / (canvas.width * canvas.height) > 0.05) return undefined

  const sample = document.createElement('canvas')
  sample.width = sample.height = size
  const sampleContext = sample.getContext('2d', { willReadFrequently: true })!
  sampleContext.drawImage(canvas, 0, 0, size, size)
  const rgba = sampleContext.getImageData(0, 0, size, size).data
  const area = size * size
  const channels = new Float32Array(3 * area)
  const means = [0.485, 0.456, 0.406]
  const deviations = [0.229, 0.224, 0.225]
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < area; i++) {
      channels[c * area + i] = (rgba[i * 4 + c]! / 255 - means[c]!) / deviations[c]!
    }
  }

  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.initTimeout = 20000
  ort.env.wasm.wasmPaths = {
    mjs: new URL(wasmLoader, location.origin).href,
    wasm: new URL(wasmBinary, location.origin).href,
  }
  segmenter ??= (async () => {
    const response = await fetch(modelUrl, { signal: AbortSignal.timeout(25000) })
    if (!response.ok) throw new Error('배경 제거 모델을 내려받지 못했어요.')
    return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'] })
  })().catch(error => {
    segmenter = undefined
    throw error
  })
  const model = await segmenter
  const outputs = await model.run({ [model.inputNames[0]!]: new ort.Tensor('float32', channels, [1, 3, size, size]) })
  const values = outputs[model.outputNames[0]!]!.data as Float32Array
  let min = Infinity, max = -Infinity
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (!Number.isFinite(max - min) || max - min < 0.15) throw new Error('배경을 구분하지 못했어요.')
  const mask = sampleContext.createImageData(size, size)
  for (let i = 0; i < area; i++) mask.data[i * 4 + 3] = 255 * (values[i]! - min) / (max - min)
  sampleContext.putImageData(mask, 0, 0)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(sample, 0, 0, canvas.width, canvas.height)

  const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0, foreground = 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (alpha[(y * canvas.width + x) * 4 + 3]! < 110) continue
      foreground++
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  const ratio = foreground / (canvas.width * canvas.height)
  if (ratio < 0.02 || ratio > 0.95) throw new Error('배경을 구분하지 못했어요.')
  const width = right - left + 1
  const height = bottom - top + 1
  const result = document.createElement('canvas')
  result.width = result.height = Math.ceil(Math.max(width, height) * 1.08)
  result.getContext('2d')!.drawImage(canvas, (result.width - width) / 2 - left, (result.height - height) / 2 - top)
  return await new Promise<Blob>((resolve, reject) => result.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('투명 사진을 만들지 못했어요.')), 'image/webp', 0.9,
  ))
}

export async function analyzeBackground(file: Blob) {
  try {
    const cutout = await removeBackground(await decodeImage(file))
    return { cutout, note: cutout ? '배경을 제거했어요.' : '이미 배경이 투명한 사진이에요.' }
  } catch (error) {
    if (import.meta.dev) console.warn('Background model:', error)
    return { cutout: undefined, note: '배경을 제거하지 못해 자른 사진을 표시했어요.' }
  }
}

export async function analyzePhotoTags(file: Blob) {
  const notes: string[] = []
  try {
    const suggestion = await classify(file)
    if (!suggestion.category) notes.push('품목을 확실히 구분하지 못했어요. 종류를 직접 골라 주세요.')
    else if (!suggestion.tags.length) notes.push('사진만으로 상황을 구분하기 어려워 태그를 비워뒀어요.')
    return { ...suggestion, notes }
  } catch (error) {
    if (import.meta.dev) console.warn('Clothing classifier:', error)
    notes.push('종류와 상황 태그를 자동으로 고르지 못했어요.')
    return { category: '' as const, tags: [], notes }
  }
}
