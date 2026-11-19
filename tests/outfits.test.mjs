import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avatarShape, orderedItems, recommendation, resolveItems } from '../app/utils/outfits.ts'

const item = (id, category, tags = []) => ({ id, category, tags })
const clothes = [
  item('work-top', 'top', ['알바']),
  item('school-top', 'top', ['학교']),
  item('plain-top', 'top'),
  item('plain-bottom', 'bottom'),
  item('other-bottom', 'bottom', ['모임']),
  item('shoe-a', 'shoes'),
  item('shoe-b', 'shoes'),
]

test('matching tags take priority and untagged clothing fills missing categories', () => {
  const session = recommendation(clothes, '학교')
  assert.equal(session.total, 2)
  assert.deepEqual(session.at(0), { top: 'school-top', bottom: 'plain-bottom', shoes: 'shoe-a' })
  assert.deepEqual(orderedItems(clothes, 'top', '학교').map(({ id }) => id), ['school-top', 'work-top', 'plain-top'])
})

test('recommendations identify missing categories, even when other tags exist', () => {
  const session = recommendation(clothes.filter(({ id }) => id !== 'plain-bottom'), '학교')
  assert.deepEqual(session.missing, ['bottom'])
  assert.equal(session.total, 0)
  assert.equal(session.at(0), undefined)
})

test('tagless recommendations traverse all combinations once and stop', () => {
  const session = recommendation(clothes, '')
  const combinations = Array.from({ length: session.total }, (_, index) => JSON.stringify(session.at(index)))
  assert.equal(session.total, 12)
  assert.equal(new Set(combinations).size, 12)
  assert.equal(session.at(session.total), undefined)
  assert.equal(session.at(-1), undefined)
})

test('avatar accepts finite positive measurements and varies each dimension', () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.equal(avatarShape(170, invalid), undefined)
    assert.equal(avatarShape(invalid, 60), undefined)
  }
  assert.ok(avatarShape(185, 60).height > avatarShape(160, 60).height)
  assert.ok(avatarShape(170, 80).width > avatarShape(170, 60).width)
})

test('saved references preserve a deleted slot while resolving remaining items', () => {
  const resolved = resolveItems(clothes, { top: 'deleted-id', bottom: 'plain-bottom', shoes: 'shoe-a' })
  assert.equal(resolved[0].category, 'top')
  assert.equal(resolved[0].item, undefined)
  assert.equal(resolved[1].item.id, 'plain-bottom')
  assert.equal(resolved[2].item.id, 'shoe-a')
})
