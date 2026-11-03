// The Worker validates Pokémon ids against the same static files the site
// serves, so D1 never stores a form that doesn't exist. The files are read
// through the ASSETS binding (no network hop) and kept for the life of the
// Worker instance.

let formIds: Promise<Set<number>> | null = null;

export function knownFormIds(env: Env): Promise<Set<number>> {
  if (!formIds) {
    formIds = env.ASSETS.fetch('https://assets.local/data/catalog/pokemon_forms.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`pokemon_forms.json: HTTP ${response.status}`);
        const rows = (await response.json()) as Array<{ id: number }>;
        return new Set(rows.map((row) => row.id));
      })
      .catch((error) => {
        formIds = null;
        throw error;
      });
  }
  return formIds;
}

/** Clears the cache. Tests use this between runs. */
export function resetCatalogCache() {
  formIds = null;
}
