import type { Item, SavedLook } from './outfits'

type Stores = { items: Item; looks: SavedLook; inbox: Blob; setup: boolean }
export const starterClothesKey = 'starter-clothes'
let connection: Promise<IDBDatabase> | undefined

function openDatabase() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('oneday-closet', 3)
    request.onupgradeneeded = (event) => {
      const db = request.result
      for (const name of ['items', 'looks', 'inbox']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
      const setup = db.createObjectStore('setup')
      const upgrade = request.transaction!
      if (event.oldVersion > 0) {
        const items = upgrade.objectStore('items').count()
        const looks = upgrade.objectStore('looks').count()
        looks.onsuccess = () => {
          if (items.result || looks.result) setup.put(true, starterClothesKey)
        }
      }
      if (!db.objectStoreNames.contains('settings')) return

      db.deleteObjectStore('settings')
      const scan = upgrade.objectStore('items').openCursor()
      scan.onsuccess = () => {
        const cursor = scan.result
        if (!cursor) return
        const item: Item & { wear?: Blob } = cursor.value
        if (Object.hasOwn(item, 'wear')) {
          delete item.wear
          cursor.update(item)
        }
        cursor.continue()
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        connection = undefined
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch(error => {
    connection = undefined
    throw error
  })
  return connection
}

async function transact<K extends keyof Stores, R>(
  name: K,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<R>,
) {
  const database = await openDatabase()
  return new Promise<R>((resolve, reject) => {
    const transaction = database.transaction(name, mode)
    let request: IDBRequest<R>
    try {
      request = operation(transaction.objectStore(name))
    } catch (error) {
      transaction.abort()
      reject(error)
      return
    }
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('저장 작업이 중단되었습니다.'))
  })
}

export const readAll = <K extends keyof Stores>(name: K) =>
  transact(name, 'readonly', store => store.getAll()) as Promise<Stores[K][]>
export const read = <K extends keyof Stores>(name: K, key: string) =>
  transact(name, 'readonly', store => store.get(key)) as Promise<Stores[K] | undefined>
export const write = <K extends keyof Stores>(name: K, key: string, value: Stores[K]) =>
  transact(name, 'readwrite', store => store.put(value, key))

export type LookDetailsPatch = Partial<Pick<SavedLook, 'title' | 'situation' | 'memo'>>
const lookDraftKey = (id: string) => `oneday-closet:look-draft:${id}`

export function pendingLookDetails(id: string): LookDetailsPatch | undefined {
  try {
    const draft = localStorage.getItem(lookDraftKey(id))
    return draft ? JSON.parse(draft) : undefined
  } catch {
    return undefined
  }
}

export function clearLookDetails(id: string) {
  try { localStorage.removeItem(lookDraftKey(id)) } catch { /* IndexedDB still works without localStorage. */ }
}

export async function persistLookDetails(id: string, change?: LookDetailsPatch) {
  const pending = pendingLookDetails(id)
  if (!pending && !change) return
  const details = { ...pending, ...change }
  const key = lookDraftKey(id)
  const snapshot = JSON.stringify(details)
  let recorded = false
  try {
    // Record the input before an asynchronous database write or page unload.
    localStorage.setItem(key, snapshot)
    recorded = true
  } catch { /* Fall back to IndexedDB alone. */ }

  const isCurrent = () => {
    if (!recorded) return true
    try { return localStorage.getItem(key) === snapshot } catch { return false }
  }
  await transact('looks', 'readwrite', store => {
    const request: IDBRequest<SavedLook | undefined> = store.get(id)
    request.onsuccess = () => {
      if (request.result && isCurrent()) store.put({ ...request.result, ...details }, id)
    }
    return request
  })
  if (recorded && isCurrent()) clearLookDetails(id)
}

export const writeItems = (items: Item[]) =>
  transact('items', 'readwrite', store => {
    for (const item of items) store.put(item, item.id)
    return store.count()
  })

export async function addStarterItems(items: Item[]) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['items', 'setup'], 'readwrite')
    const setup = transaction.objectStore('setup')
    const wardrobe = transaction.objectStore('items')
    const initialized = setup.get(starterClothesKey)
    const count = wardrobe.count()
    count.onsuccess = () => {
      if (initialized.result) return
      if (count.result === 0) {
        for (const item of items) wardrobe.add(item, item.id)
      }
      setup.put(true, starterClothesKey)
    }
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('예시 옷을 저장하지 못했어요.'))
  })
}
export const removeSelected = (name: 'items' | 'looks', ids: string[]) =>
  transact(name, 'readwrite', store => {
    for (const id of ids) store.delete(id)
    return store.count()
  })
export const remove = <K extends keyof Stores>(name: K, key: string) =>
  transact(name, 'readwrite', store => store.delete(key))
