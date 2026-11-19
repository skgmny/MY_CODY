import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

function worker({ failStorage = false } = {}) {
  const listeners = new Map()
  const inbox = new Map()
  const database = {
    close() {},
    transaction() {
      const tx = { objectStore: () => ({ delete() {}, put: (value, key) => inbox.set(key, value) }) }
      queueMicrotask(() => failStorage ? tx.onabort() : tx.oncomplete())
      return tx
    },
  }
  const indexedDB = {
    open() {
      const request = { result: database }
      queueMicrotask(() => request.onsuccess())
      return request
    },
  }
  runInNewContext(source, {
    self: {
      location: { origin: 'https://closet.example' },
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
    URL, File, Response, crypto, indexedDB, IDBKeyRange: { upperBound: key => key },
  })
  return {
    inbox,
    share(form) {
      const request = new Request('https://closet.example/share-target', { method: 'POST', body: form })
      let result
      listeners.get('fetch')({ request, respondWith: response => { result = response } })
      return result
    },
  }
}

test('share worker stages an image before redirecting to registration', async () => {
  const { inbox, share } = worker()
  const form = new FormData()
  form.set('images', new File(['photo'], 'test.png', { type: 'image/png' }))
  const result = await share(form)
  const destination = new URL(result.headers.get('location'))
  assert.equal(result.status, 303)
  assert.equal(destination.pathname, '/')
  assert.equal(inbox.get(destination.searchParams.get('share')).type, 'image/png')
})

test('link-only shares and failed transactions redirect to manual selection', async () => {
  const form = new FormData()
  form.set('url', 'https://shop.example/item')
  const { inbox, share } = worker()
  const linkResult = await share(form)
  assert.equal(new URL(linkResult.headers.get('location')).search, '?share=fallback')
  assert.equal(inbox.size, 0)

  form.set('images', new File(['photo'], 'test.png', { type: 'image/png' }))
  const failed = await worker({ failStorage: true }).share(form)
  assert.equal(new URL(failed.headers.get('location')).search, '?share=fallback')
})
