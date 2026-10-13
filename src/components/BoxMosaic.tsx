import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { BOX_SIZE } from '../lib/boxes';

export type CellState = 'missing' | 'owned' | 'shiny';

export { BOX_SIZE };

type BoxMosaicProps = {
  cells: CellState[];
  /** Link for each box; omit for a purely decorative mosaic. */
  boxHref?: (boxIndex: number) => string;
  /** Plays the one-time fill animation (landing page only). */
  animate?: boolean;
  /** First Dex number in each box, for accessible labels. */
  firstNumberOfBox?: (boxIndex: number) => number;
  className?: string;
};

/**
 * A collection drawn the way collectors store it: 30-slot boxes (6 × 5, like
 * Pokémon HOME), filled blue for owned and gold for shiny.
 */
export function BoxMosaic({ cells, boxHref, animate = false, firstNumberOfBox, className = '' }: BoxMosaicProps) {
  const boxes: CellState[][] = [];
  for (let i = 0; i < cells.length; i += BOX_SIZE) boxes.push(cells.slice(i, i + BOX_SIZE));

  return (
    <div className={`box-mosaic${animate ? ' box-mosaic--animate' : ''} ${className}`} aria-hidden={boxHref ? undefined : true}>
      {boxes.map((box, boxIndex) => {
        const owned = box.filter((cell) => cell !== 'missing').length;
        const shiny = box.filter((cell) => cell === 'shiny').length;
        const complete = owned === box.length;
        const first = firstNumberOfBox?.(boxIndex);
        const content = (
          <>
            <span className="box-mosaic__grid">
              {box.map((cell, cellIndex) => (
                <i
                  key={cellIndex}
                  className={`box-mosaic__cell box-mosaic__cell--${cell}`}
                  style={animate ? ({ '--i': boxIndex * BOX_SIZE + cellIndex } as CSSProperties) : undefined}
                />
              ))}
              {/* A part-filled last box still shows all 30 slots, like HOME. */}
              {Array.from({ length: BOX_SIZE - box.length }, (_, index) => (
                <i key={`empty-${index}`} className="box-mosaic__cell box-mosaic__cell--empty" />
              ))}
            </span>
            <span className="box-mosaic__label">
              <span><span className="box-mosaic__word">Box </span>{boxIndex + 1}</span>
              <span className="box-mosaic__count">{complete ? '✓' : `${owned}/${box.length}`}</span>
            </span>
          </>
        );

        const label = `Box ${boxIndex + 1}${first ? `, from #${first}` : ''}: ${owned} of ${box.length} owned${shiny ? `, ${shiny} shiny` : ''}`;

        return boxHref ? (
          <Link key={boxIndex} className={`box-mosaic__box${complete ? ' is-complete' : ''}`} to={boxHref(boxIndex)} aria-label={label}>
            {content}
          </Link>
        ) : (
          <span key={boxIndex} className={`box-mosaic__box${complete ? ' is-complete' : ''}`}>{content}</span>
        );
      })}
    </div>
  );
}
