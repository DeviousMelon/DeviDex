import type { supabase } from './supabase';

type Client = NonNullable<typeof supabase>;
type ProgressTable = 'collection_progress' | 'game_collection_progress' | 'game_form_collection_progress';

/**
 * "Owns nothing" for one progress row: delete it, unless it carries a note.
 *
 * Two steps, because a single delete filtered on `notes is null` silently
 * skips rows that have a note — those must stay, but as unowned, otherwise the
 * Pokémon reappears ticked after a reload. The update only ever touches the
 * rows the delete left behind (i.e. ones with a note); if there are none, it
 * is a harmless no-op.
 */
export async function clearProgressRow(
  client: Client,
  table: ProgressTable,
  keys: Record<string, string | number>,
): Promise<{ error: { message: string } | null }> {
  const { error: deleteError } = await client
    .from(table)
    .delete()
    .match(keys)
    .is('notes', null);
  if (deleteError) return { error: deleteError };

  const { error: updateError } = await client
    .from(table)
    .update({ normal_owned: false, shiny_owned: false })
    .match(keys);
  return { error: updateError };
}
