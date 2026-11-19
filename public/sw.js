const cacheName = 'oneday-closet-shell-v1'
const root = new URL('/', self.location.origin)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    const response = await fetch(root, { cache: 'reload' })
    if (!response.ok) throw new Error('App shell unavailable')
    const html = await response.clone().text()
    const assets = [...html.matchAll(/(?:src|href)="(\/_nuxt\/[^"]+)"/g)].map(match => match[1])
    await cache.put(root, response)
    await cache.addAll([...new Set(['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/wardrobe-hero.jpg', ...assets])])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('oneday-closet-shell-') && key !== cacheName) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

function stageImage(file, id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oneday-closet', 1)
    request.onupgradeneeded = () => {
      for (const name of ['items', 'looks', 'settings', 'inbox']) request.result.createObjectStore(name)
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('inbox', 'readwrite')
      const inbox = transaction.objectStore('inbox')
      inbox.delete(IDBKeyRange.upperBound(String(Date.now() - 86400000) + '\uffff'))
      inbox.put(file, id)
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  })
}

async function receiveShare(request) {
  const destination = new URL(root)
  destination.searchParams.set('share', 'fallback')
  try {
    const form = await request.formData()
    const image = form.getAll('images').find(value => value instanceof File
      && value.type.startsWith('image/') && value.size > 0 && value.size <= 25 * 1024 * 1024)
    if (image) {
      const id = Date.now() + '-' + crypto.randomUUID()
      await stageImage(image, id)
      destination.searchParams.set('share', id)
    }
  } catch {
    // Return to the import screen with a manual photo picker.
  }
  return Response.redirect(destination, 303)
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      try { await cache.put(fallback, response.clone()) } catch { /* Keep serving when cache is full. */ }
      return response
    }
    return await cache.match(fallback) || response
  } catch {
    return await cache.match(fallback) || Response.error()
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== root.origin) return
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request))
  } else if (request.method === 'GET' && request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(networkFirst(request, root))
  } else if (request.method === 'GET' && (url.pathname.startsWith('/_nuxt/')
    || ['/wardrobe-hero.jpg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'].includes(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName)
      return await cache.match(request) || networkFirst(request, request)
    })())
  }
})
