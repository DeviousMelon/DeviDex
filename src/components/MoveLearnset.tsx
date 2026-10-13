import { useEffect, useMemo, useState } from 'react';
import { inheritedVersionGroupsForContext } from '../lib/gameContext';
import {
  fetchMachineDetail,
  fetchMoveDetail,
  formatMachineItemName,
  humanizeApiName,
  latestEnglishMoveEffect,
  moveLevelLabel,
  versionGroupLabel,
  type MoveDetail,
  type PokemonDetail,
} from '../lib/pokeapi';

type MoveGroup = 'level-up' | 'machine' | 'tutor' | 'egg' | 'other';

type LearnsetRow = {
  moveSlug: string;
  methodSlug: string;
  level: number;
  sourceVersionGroup: string;
};

const groupLabels: Record<MoveGroup, string> = {
  'level-up': 'Level up',
  machine: 'TM / HM / TR',
  tutor: 'Tutor',
  egg: 'Egg Moves',
  other: 'Other',
};

const groupOrder: MoveGroup[] = ['level-up', 'machine', 'tutor', 'egg', 'other'];

function methodGroup(method: string): MoveGroup {
  if (method === 'level-up') return 'level-up';
  if (method === 'machine') return 'machine';
  if (method === 'tutor') return 'tutor';
  if (method === 'egg' || method === 'light-ball-egg') return 'egg';
  return 'other';
}

function compareRows(a: LearnsetRow, b: LearnsetRow) {
  const aGroup = methodGroup(a.methodSlug);
  const bGroup = methodGroup(b.methodSlug);
  const groupDelta = groupOrder.indexOf(aGroup) - groupOrder.indexOf(bGroup);
  if (groupDelta !== 0) return groupDelta;
  if (aGroup === 'level-up' && a.level !== b.level) return a.level - b.level;
  return a.moveSlug.localeCompare(b.moveSlug);
}

function MoveRow({ row }: { row: LearnsetRow }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MoveDetail | null>(null);
  const [machineLabel, setMachineLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setDetail(null);
    setMachineLabel(null);
    setError(null);
  }, [row.moveSlug, row.methodSlug, row.level, row.sourceVersionGroup]);

  useEffect(() => {
    if (!open || detail) return;
    const controller = new AbortController();

    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const move = await fetchMoveDetail(row.moveSlug, controller.signal);
        if (controller.signal.aborted) return;
        setDetail(move);

        if (row.methodSlug === 'machine') {
          const machine = move.machines.find((item) => item.version_group.name === row.sourceVersionGroup);
          if (machine) {
            try {
              const machineData = await fetchMachineDetail(machine.machine.url, controller.signal);
              if (!controller.signal.aborted) setMachineLabel(formatMachineItemName(machineData.item.name));
            } catch {
              // A historical machine lookup can fail while the rest of the move
              // row remains useful, so do not throw away the whole card.
            }
          }
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load move details.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadDetail();
    return () => controller.abort();
  }, [detail, open, row.methodSlug, row.moveSlug, row.sourceVersionGroup]);

  const effect = detail ? latestEnglishMoveEffect(detail) : '';
  const learnLabel = row.methodSlug === 'machine' && machineLabel
    ? machineLabel
    : moveLevelLabel(row.methodSlug, row.level);
  const isLevel = row.methodSlug === 'level-up';

  return (
    <article className={`move-row${open ? ' is-open' : ''}`}>
      <button className="move-row__summary" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="move-row__name">{humanizeApiName(row.moveSlug)}</span>
        <span className={`move-row__method${isLevel ? ' move-row__method--level' : ''}`}>{learnLabel}</span>
        <span className="move-row__chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="move-row__details">
          {loading && <p>Loading move details…</p>}
          {error && <p className="pokemon-detail-source-state pokemon-detail-source-state--warning">{error}</p>}
          {detail && (
            <>
              <div className="move-detail-facts">
                <span className={`pokemon-type pokemon-type--${detail.type.name}`}>{humanizeApiName(detail.type.name)}</span>
                <span><strong>{humanizeApiName(detail.damage_class.name)}</strong> category</span>
                <span><strong>{detail.power ?? '—'}</strong> power</span>
                <span><strong>{detail.accuracy != null ? `${detail.accuracy}%` : '—'}</strong> accuracy</span>
                <span><strong>{detail.pp ?? '—'}</strong> PP</span>
                {detail.priority !== 0 && <span><strong>{detail.priority > 0 ? `+${detail.priority}` : detail.priority}</strong> priority</span>}
              </div>
              {row.methodSlug === 'machine' && (
                <p className="move-row__machine-note">
                  <strong>Machine:</strong> {machineLabel ?? 'PokéAPI does not list a machine number for this game group.'}
                </p>
              )}
              {effect && <p className="move-row__effect">{effect}</p>}
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function MoveLearnset({
  pokemon,
  versionGroup,
  breedingSupported,
}: {
  pokemon: PokemonDetail;
  versionGroup: string;
  breedingSupported: boolean;
}) {
  const [group, setGroup] = useState<MoveGroup>('level-up');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const includedGroups = inheritedVersionGroupsForContext(versionGroup);
    const groupRank = new Map(includedGroups.map((slug, index) => [slug, index]));
    const unique = new Map<string, LearnsetRow>();

    pokemon.moves.forEach((entry) => {
      const matching = entry.version_group_details
        .filter((detail) => groupRank.has(detail.version_group.name));
      if (!matching.length) return;

      // Expansion groups can repeat a base-game move with changed details. Use
      // the most specific context that has records for this move, while keeping
      // multiple legitimate level entries inside that same game group.
      const mostSpecificRank = Math.max(...matching.map((detail) => groupRank.get(detail.version_group.name) ?? 0));
      matching
        .filter((detail) => (groupRank.get(detail.version_group.name) ?? 0) === mostSpecificRank)
        .forEach((detail) => {
          const row: LearnsetRow = {
            moveSlug: entry.move.name,
            methodSlug: detail.move_learn_method.name,
            level: detail.level_learned_at,
            sourceVersionGroup: detail.version_group.name,
          };
          unique.set(`${row.moveSlug}|${row.methodSlug}|${row.level}|${row.sourceVersionGroup}`, row);
        });
    });

    return [...unique.values()].sort(compareRows);
  }, [pokemon.moves, versionGroup]);

  const counts = useMemo(() => {
    const result: Record<MoveGroup, number> = {
      'level-up': 0,
      machine: 0,
      tutor: 0,
      egg: 0,
      other: 0,
    };
    rows.forEach((row) => { result[methodGroup(row.methodSlug)] += 1; });
    return result;
  }, [rows]);

  useEffect(() => {
    setGroup('level-up');
    setSearch('');
  }, [pokemon.id, versionGroup]);

  useEffect(() => {
    if (counts[group] > 0) return;
    const firstAvailable = groupOrder.find((key) => counts[key] > 0);
    if (firstAvailable) setGroup(firstAvailable);
  }, [counts, group]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (methodGroup(row.methodSlug) !== group) return false;
      if (!needle) return true;
      return humanizeApiName(row.moveSlug).toLowerCase().includes(needle)
        || row.moveSlug.includes(needle.replace(/\s+/g, '-'));
    });
  }, [group, rows, search]);

  return (
    <section className="pokemon-info-card pokemon-moves-card" id="moves">
      <div className="pokemon-info-card__heading pokemon-info-card__heading--inline pokemon-moves-card__heading">
        <div>
          <p className="eyebrow">MOVES · {versionGroupLabel(versionGroup)}</p>
          <h2>Learnset</h2>
          <p>The game context above controls this entire learnset. Each learning method gets its own tab by default.</p>
        </div>
      </div>

      <div className="move-tabs" role="tablist" aria-label="Move learn method">
        {groupOrder.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            className={group === key ? 'is-active' : ''}
            disabled={counts[key] === 0}
            onClick={() => setGroup(key)}
          >
            {groupLabels[key]} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="move-toolbar move-toolbar--tabbed">
        <label className="collection-search move-search">
          <span>Search {groupLabels[group]}</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. Ice Beam" />
        </label>
      </div>

      <div className="move-result-line">
        <strong>{filteredRows.length.toLocaleString()}</strong> {groupLabels[group].toLowerCase()} in {versionGroupLabel(versionGroup)}
      </div>

      {filteredRows.length ? (
        <section className="move-group move-group--active" role="tabpanel">
          <div className="move-list">
            {filteredRows.map((row) => (
              <MoveRow key={`${row.sourceVersionGroup}-${row.moveSlug}-${row.methodSlug}-${row.level}`} row={row} />
            ))}
          </div>
        </section>
      ) : (
        <div className="dex-empty-state move-empty-state"><strong>No moves are listed in this tab for the selected game.</strong></div>
      )}

      {counts.egg === 0 && (
        <p className="pokemon-detail-source-state pokemon-detail-source-state--quiet move-egg-note">
          {breedingSupported
            ? 'PokéAPI currently lists no Egg Move records for this Pokémon in the selected game context. DeviDex will not silently borrow Egg Moves from a different generation.'
            : 'Breeding is not available in this game, so an Egg Move tab is not applicable here.'}
        </p>
      )}

      <p className="pokemon-detail-source-note pokemon-moves-card__note">
        Learnsets are filtered by the selected game/version group. Expansion contexts inherit their base game data, then apply expansion-specific additions.
      </p>
    </section>
  );
}
