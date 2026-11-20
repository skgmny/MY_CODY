import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderedItems, recommendation, resolveItems } from '../app/utils/outfits.ts'

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
  const session = recommendation(clothes, '학교', () => 0.9)
  assert.equal(session.total, 2)
  assert.deepEqual(session.at(0), { top: 'school-top', bottom: 'plain-bottom', shoes: 'shoe-b' })
  assert.deepEqual(session.at(1), { top: 'school-top', bottom: 'plain-bottom', shoes: 'shoe-a' })
  assert.deepEqual(orderedItems(clothes, 'top', '학교').map(({ id }) => id), ['school-top', 'work-top', 'plain-top'])
})

test('recommendations identify missing categories, even when other tags exist', () => {
  const session = recommendation(clothes.filter(({ id }) => id !== 'plain-bottom'), '학교')
  assert.deepEqual(session.missing, ['bottom'])
  assert.equal(session.total, 0)
  assert.equal(session.at(0), undefined)
})

test('manual outfit choices keep situation priority within selected items only', () => {
  const selected = new Set(['school-top', 'work-top', 'shoe-b'])
  assert.deepEqual(orderedItems(clothes, 'top', '학교', selected).map(({ id }) => id), ['school-top', 'work-top'])
  assert.deepEqual(orderedItems(clothes, 'shoes', '', selected).map(({ id }) => id), ['shoe-b'])
  assert.deepEqual(orderedItems(clothes, 'bottom', '', selected), [])
})

test('tagless recommendations traverse all combinations once and stop', () => {
  const session = recommendation(clothes, '', () => 0.72)
  const combinations = Array.from({ length: session.total }, (_, index) => JSON.stringify(session.at(index)))
  assert.equal(session.total, 12)
  assert.equal(new Set(combinations).size, 12)
  assert.equal(session.at(session.total), undefined)
  assert.equal(session.at(-1), undefined)
})

test('the next draw can change every category and previous draws stay stable', () => {
  const rolls = [0, 0.72]
  const session = recommendation(clothes, '', () => rolls.shift())
  assert.deepEqual(session.at(1), { top: 'school-top', bottom: 'other-bottom', shoes: 'shoe-b' })
  assert.deepEqual(session.at(0), { top: 'work-top', bottom: 'plain-bottom', shoes: 'shoe-a' })
  assert.deepEqual(session.at(1), { top: 'school-top', bottom: 'other-bottom', shoes: 'shoe-b' })
  assert.equal(rolls.length, 0)
})

test('saved references preserve a deleted slot while resolving remaining items', () => {
  const resolved = resolveItems(clothes, { top: 'deleted-id', bottom: 'plain-bottom', shoes: 'shoe-a' })
  assert.equal(resolved[0].category, 'top')
  assert.equal(resolved[0].item, undefined)
  assert.equal(resolved[1].item.id, 'plain-bottom')
  assert.equal(resolved[2].item.id, 'shoe-a')
})
