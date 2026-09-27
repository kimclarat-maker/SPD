"use client";

/**
 * Attachments captured in the field are kept in the browser's IndexedDB until
 * they have been uploaded, so photos survive closing the browser without
 * filling the small localStorage quota. Photos are resized and re-encoded
 * before they are stored, which cuts upload size on slow connections.
 *
 * PROTOTYPE: the central system receives only each file's name and size; no
 * file content leaves the device. After a successful sync the device copy is
 * deleted.
 */
const DB_NAME = "rpcms-field-files";
const STORE = "files";

export interface LocalAttachment {
  id: string;
  name: string;
  mime: string;
  kind: "photo" | "document";
  /** Size of the file the officer chose. */
  originalKb: number;
  /** Size after compression; this is what would be uploaded. */
  storedKb: number;
  /** A copy is on this device (removed after upload). */
  stored: boolean;
  uploaded?: boolean;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request ? request.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function putFile(id: string, blob: Blob): Promise<void> {
  await run("readwrite", (s) => s.put(blob, id));
}

export async function getFile(id: string): Promise<Blob | undefined> {
  try {
    return (await run<Blob>("readonly", (s) => s.get(id))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function deleteFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await run("readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
    });
  } catch {
    // Nothing more to do: a missing store has nothing to delete.
  }
}

export async function clearFiles(prefix: string): Promise<void> {
  try {
    const keys = ((await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? []).map(String);
    await deleteFiles(keys.filter((k) => k.startsWith(prefix)));
  } catch {
    // ignore
  }
}

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;
const MAX_DOCUMENT_KB = 5 * 1024;

/** Resizes and re-encodes a photo. Falls back to the original when the browser cannot decode it. */
export async function compressImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export class AttachmentError extends Error {
  constructor(public code: "TOO_LARGE" | "STORAGE") {
    super(code);
  }
}

/** Compresses (photos), stores the file on the device, and returns its description. */
export async function captureAttachment(file: File, idPrefix: string): Promise<LocalAttachment> {
  const isImage = file.type.startsWith("image/");
  const originalKb = Math.max(1, Math.round(file.size / 1024));
  if (!isImage && originalKb > MAX_DOCUMENT_KB) throw new AttachmentError("TOO_LARGE");
  const blob = isImage ? await compressImage(file) : file;
  const id = `${idPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await putFile(id, blob);
  } catch {
    throw new AttachmentError("STORAGE");
  }
  const name = isImage && blob !== file ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name;
  return { id, name, mime: blob.type || file.type, kind: isImage ? "photo" : "document", originalKb, storedKb: Math.max(1, Math.round(blob.size / 1024)), stored: true };
}

/** Asks the browser not to clear this site's storage under pressure. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageStatus(): Promise<{ usedKb?: number; quotaKb?: number; persisted: boolean | null }> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    return {
      usedKb: estimate?.usage !== undefined ? Math.round(estimate.usage / 1024) : undefined,
      quotaKb: estimate?.quota !== undefined ? Math.round(estimate.quota / 1024) : undefined,
      persisted,
    };
  } catch {
    return { persisted: null };
  }
}
