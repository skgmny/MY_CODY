import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultCrop, photoCropRect } from '../app/utils/images.ts'
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

test('outfits recover full legacy images and respect user crops', () => {
  const original = new Blob(['original'])
  const photo = new Blob(['old square'])
  const cutout = new Blob(['cutout'])
  const item = { original, photo, crop: defaultCrop() }
  assert.equal(outfitPhoto(item), original)
  assert.equal(outfitPhoto({ ...item, cutout }), cutout)
  assert.equal(outfitPhoto({ ...item, cutout, crop: { ...defaultCrop(), zoom: 1.4 } }), photo)
})
