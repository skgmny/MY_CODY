import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultCrop, fitsPhotoUpload, fullPhotoBounds, photoCropRect, resizePhotoBounds, selectedPhotoBounds } from '../app/utils/images.ts'
import { outfitPhoto } from '../app/utils/outfits.ts'

test('default framing keeps the whole garment in portrait and landscape photos', () => {
  for (const [width, height] of [[400, 900], [900, 400]]) {
    assert.deepEqual(photoCropRect(width, height, defaultCrop()), { x: 0, y: 0, width, height })
  }
})

test('zoom and placement crop the photo while keeping its proportions', () => {
  assert.deepEqual(photoCropRect(400, 900, { zoom: 2, x: 25, y: 100 }),
    { x: 50, y: 450, width: 200, height: 450 })
})

test('the upload cap counts photos already in the registration', () => {
  assert.equal(fitsPhotoUpload(0, 10), true)
  assert.equal(fitsPhotoUpload(0, 11), false)
  assert.equal(fitsPhotoUpload(8, 2), true)
  assert.equal(fitsPhotoUpload(8, 3), false)
  assert.equal(fitsPhotoUpload(0, 2, 1), false)
})

test('selected edges set the source pixels used for analysis and later edits', () => {
  const bounds = { left: 25, top: 10, right: 80, bottom: 90 }
  assert.equal(selectedPhotoBounds(fullPhotoBounds()), undefined)
  assert.deepEqual(structuredClone(selectedPhotoBounds(new Proxy(bounds, {}))), bounds)
  assert.deepEqual(photoCropRect(400, 1000, defaultCrop(), bounds), { x: 100, y: 100, width: 220, height: 800 })
  assert.deepEqual(photoCropRect(400, 1000, { ...defaultCrop(), zoom: 2 }, bounds),
    { x: 155, y: 300, width: 110, height: 400 })
})

test('dragging a corner moves two edges and keeps the crop within the photo', () => {
  const full = fullPhotoBounds()
  assert.deepEqual(resizePhotoBounds(full, 'nw', 20, 10), { ...full, left: 20, top: 10 })
  assert.deepEqual(resizePhotoBounds(full, 'w', -20, 16), full)
  assert.deepEqual(resizePhotoBounds(full, 'se', -120, -140), { ...full, right: 5, bottom: 5 })
})

test('outfits recover full legacy images and respect user crops', () => {
  const original = new Blob(['original'])
  const photo = new Blob(['old square'])
  const cutout = new Blob(['cutout'])
  const item = { original, photo, crop: defaultCrop() }
  assert.equal(outfitPhoto(item), original)
  assert.equal(outfitPhoto({ ...item, cutout }), cutout)
  assert.equal(outfitPhoto({ ...item, cutout, useCutout: false }), photo)
  assert.equal(outfitPhoto({ ...item, cutout, crop: { ...defaultCrop(), zoom: 1.4 } }), photo)
  assert.equal(outfitPhoto({ ...item, sourceBounds: { ...fullPhotoBounds(), right: 80 } }), photo)
})
