import type { ReactNode } from 'react';
import { chunkIntoBoxes } from '../lib/boxes';

type DexBoxesProps<T> = {
  items: T[];
  /** Grouped into 30-slot boxes when true; one continuous grid otherwise. */
  boxed: boolean;
  itemKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  /** e.g. "#0001–#0030" */
  boxRange: (box: T[]) => string;
  isOwned: (item: T) => boolean;
  label: string;
};

/** The Dex grid, optionally laid out as HOME-style boxes of 6 × 5. */
export function DexBoxes<T>({ items, boxed, itemKey, renderItem, boxRange, isOwned, label }: DexBoxesProps<T>) {
  if (!boxed) {
    return (
      <div className="tile-grid" role="list" aria-label={label}>
        {items.map((item) => <div role="listitem" key={itemKey(item)}>{renderItem(item)}</div>)}
      </div>
    );
  }

  return (
    <div className="dex-boxes" aria-label={label}>
      {chunkIntoBoxes(items).map((box, index) => {
        const owned = box.filter(isOwned).length;
        const complete = owned === box.length;
        return (
          <section className={`dex-box${complete ? ' is-complete' : ''}`} id={`box-${index + 1}`} key={index} aria-labelledby={`box-${index + 1}-title`}>
            <header className="dex-box__head">
              <h2 id={`box-${index + 1}-title`}>Box {index + 1}</h2>
              <span className="dex-box__range">{boxRange(box)}</span>
              <span className="dex-box__count">{complete ? 'Complete' : `${owned}/${box.length}`}</span>
            </header>
            <div className="tile-grid tile-grid--box" role="list">
              {box.map((item) => <div role="listitem" key={itemKey(item)}>{renderItem(item)}</div>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
