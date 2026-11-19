import type { Avatar, Item, SavedLook } from './outfits'

type Stores = { items: Item; looks: SavedLook; settings: Avatar; inbox: Blob }
let connection: Promise<IDBDatabase> | undefined

function openDatabase() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('oneday-closet', 1)
    request.onupgradeneeded = () => {
      for (const name of ['items', 'looks', 'settings', 'inbox']) request.result.createObjectStore(name)
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
    const request = operation(transaction.objectStore(name))
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
export const remove = <K extends keyof Stores>(name: K, key: string) =>
  transact(name, 'readwrite', store => store.delete(key))
