import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PlaceholderPageProps {
  title: string;
  description: ReactNode;
}

/** Simple message page: "coming soon" features and the 404. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <main className="message-page">
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="message-page__actions">
        <Link className="button button--primary" to="/">Go home</Link>
        <Link className="button button--secondary" to="/national-dex">Open the National Dex</Link>
      </div>
    </main>
  );
}
