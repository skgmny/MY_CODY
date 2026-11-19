import assert from 'node:assert/strict'
import { test } from 'node:test'
import { photoLabels, photoSuggestions } from '../app/utils/photo-suggestions.ts'

const scores = values => photoLabels.map((label, index) => ({ label, score: values[index] }))

test('suggests shoes and exercise from clear image scores', () => {
  assert.deepEqual(photoSuggestions(scores([.02, .03, .4, .02, .01, .02, .4, .02, .05, .03])),
    { category: 'shoes', tags: ['운동'] })
})

test('leaves the occasion blank when competing styles look similar', () => {
  assert.deepEqual(photoSuggestions(scores([.4, .03, .02, .02, .01, .02, .16, .15, .14, .05])),
    { category: 'top', tags: [] })
})

test('suggests everyday wear when it clearly leads the other styles', () => {
  assert.deepEqual(photoSuggestions(scores([.4, .03, .02, .02, .01, .02, .07, .08, .27, .08])),
    { category: 'top', tags: ['일상'] })
})

test('leaves the category and tags blank for ambiguous or multi-item photos', () => {
  assert.deepEqual(photoSuggestions(scores([.19, .18, .1, .01, .01, .01, .4, .02, .05, .03])),
    { category: '', tags: [] })
  assert.deepEqual(photoSuggestions(scores([.03, .02, .02, .01, .4, .02, .4, .02, .05, .03])),
    { category: '', tags: [] })
})
