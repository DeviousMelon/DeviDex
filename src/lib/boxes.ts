import type { DexCatalogEntry } from '../types';

export const BOX_SIZE = 30;

/** National Dex storage order: by Dex number, base form before its variants. */
export function storageOrder(entries: DexCatalogEntry[]) {
  return [...entries].sort(
    (a, b) => a.dexNumber - b.dexNumber || Number(b.isDefault) - Number(a.isDefault) || a.formId - b.formId,
  );
}

export function chunkIntoBoxes<T>(items: T[], size = BOX_SIZE): T[][] {
  const boxes: T[][] = [];
  for (let i = 0; i < items.length; i += size) boxes.push(items.slice(i, i + size));
  return boxes;
}

/** Scrolls to #box-N once the content exists (the grid renders after data loads). */
export function scrollToHashBox(hash: string) {
  if (!/^#box-\d+$/.test(hash)) return;
  window.requestAnimationFrame(() => {
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  });
}
