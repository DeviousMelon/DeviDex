import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Small link or breadcrumb shown above the title, e.g. "← All Game Dexes". */
  back?: ReactNode;
  /** Buttons or stats aligned to the right on wide screens. */
  aside?: ReactNode;
};

/** The one page-title pattern used by every app page. */
export function PageHeader({ title, description, back, aside }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {back && <div className="page-header__back">{back}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {aside && <div className="page-header__aside">{aside}</div>}
    </header>
  );
}
