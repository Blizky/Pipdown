const DB_NAME = "pipdown-db";
const DB_VERSION = 2;
const SNAP_STORE = "snaps";
const SETTINGS_STORE = "settings";
const DIGEST_STORE = "digests";

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SNAP_STORE)) {
        const snaps = db.createObjectStore(SNAP_STORE, { keyPath: "id" });
        snaps.createIndex("dateKey", "dateKey", { unique: false });
        snaps.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(DIGEST_STORE)) {
        db.createObjectStore(DIGEST_STORE, { keyPath: "dateKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSettings(defaults) {
  const store = await tx(SETTINGS_STORE);
  const record = await promisify(store.get("app"));
  return { ...defaults, ...(record?.value || {}) };
}

export async function saveSettings(settings) {
  const store = await tx(SETTINGS_STORE, "readwrite");
  await promisify(store.put({ key: "app", value: settings }));
}

export async function addSnap(snap) {
  const snaps = await getSnapsByDay(snap.dateKey);
  const record = await toStoredSnap(snap);
  const store = await tx(SNAP_STORE, "readwrite");
  await promisify(store.put({ ...record, orderIndex: snaps.length }));
}

export async function getSnapsByDay(dateKey) {
  const store = await tx(SNAP_STORE);
  const index = store.index("dateKey");
  const snaps = await promisify(index.getAll(dateKey));
  const hydrated = snaps.map(fromStoredSnap);
  return hydrated.sort((a, b) => a.orderIndex - b.orderIndex || a.timestamp - b.timestamp);
}

export async function getAllSnaps() {
  const store = await tx(SNAP_STORE);
  const snaps = await promisify(store.getAll());
  const hydrated = snaps.map(fromStoredSnap);
  return hydrated.sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateSnap(snap) {
  const record = await toStoredSnap(snap);
  const store = await tx(SNAP_STORE, "readwrite");
  await promisify(store.put(record));
}

export async function deleteSnap(id) {
  const store = await tx(SNAP_STORE, "readwrite");
  await promisify(store.delete(id));
}

export async function setHighlight(dateKey, snapId) {
  const snaps = await getSnapsByDay(dateKey);
  await Promise.all(snaps.map((snap) => updateSnap({ ...snap, highlight: snap.id === snapId })));
}

export async function reorderSnap(dateKey, snapId, direction) {
  const snaps = await getSnapsByDay(dateKey);
  const index = snaps.findIndex((snap) => snap.id === snapId);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= snaps.length) return;

  [snaps[index], snaps[target]] = [snaps[target], snaps[index]];
  await Promise.all(snaps.map((snap, orderIndex) => updateSnap({ ...snap, orderIndex })));
}

export async function getDays() {
  const snaps = await getAllSnaps();
  const groups = new Map();

  for (const snap of snaps) {
    const group = groups.get(snap.dateKey) || [];
    group.push(snap);
    groups.set(snap.dateKey, group);
  }

  return [...groups.entries()]
    .map(([dateKey, daySnaps]) => {
      const ordered = daySnaps.sort((a, b) => a.orderIndex - b.orderIndex);
      const highlight = ordered.find((snap) => snap.highlight);
      return {
        dateKey,
        count: daySnaps.length,
        visibleCount: daySnaps.length,
        thumbnail: (highlight || ordered[0] || daySnaps[0])?.stillUrl,
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export async function clearAllCache() {
  const db = await openDb();
  const storeNames = [SNAP_STORE, SETTINGS_STORE, DIGEST_STORE].filter((name) => db.objectStoreNames.contains(name));
  if (!storeNames.length) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, "readwrite");
    storeNames.forEach((name) => transaction.objectStore(name).clear());
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedDigest(dateKey) {
  const store = await tx(DIGEST_STORE);
  const record = await promisify(store.get(dateKey));
  return record || null;
}

export async function putCachedDigest({ dateKey, signature, aspectRatio, videoBlob }) {
  const videoBytes = await videoBlob.arrayBuffer();
  const store = await tx(DIGEST_STORE, "readwrite");
  await promisify(
    store.put({
      dateKey,
      signature,
      aspectRatio,
      videoType: videoBlob.type || "video/mp4",
      videoBytes,
      updatedAt: Date.now(),
    }),
  );
}

async function toStoredSnap(snap) {
  const base = { ...snap };
  delete base.videoBlob;
  delete base.stillBlob;
  delete base.stillObjectUrl;

  if (snap.videoBlob instanceof Blob) {
    base.videoBytes = await snap.videoBlob.arrayBuffer();
    base.videoType = snap.videoBlob.type || "video/mp4";
  }

  if (snap.stillBlob instanceof Blob) {
    base.stillBytes = await snap.stillBlob.arrayBuffer();
    base.stillType = snap.stillBlob.type || "image/jpeg";
    delete base.stillUrl;
  }

  return base;
}

function fromStoredSnap(snap) {
  const hydrated = { ...snap };
  if (snap.videoBytes) {
    hydrated.videoBlob = new Blob([snap.videoBytes], { type: snap.videoType || "video/mp4" });
  }
  if (snap.stillBytes) {
    const stillBlob = new Blob([snap.stillBytes], { type: snap.stillType || "image/jpeg" });
    hydrated.stillUrl = URL.createObjectURL(stillBlob);
    hydrated.stillObjectUrl = true;
  }
  return hydrated;
}
