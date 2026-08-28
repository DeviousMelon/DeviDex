interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
}

// Real routes are established now even though these features are unfinished.
// We can later replace the page component without changing users' URLs.
export function PlaceholderPage({ eyebrow, title, description }: PlaceholderPageProps) {
  return (
    <main className="placeholder-page">
      <section>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="placeholder-mark">✓ <span>Foundation route ready</span></div>
      </section>
    </main>
  );
}
