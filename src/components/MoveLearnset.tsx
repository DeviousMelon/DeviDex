import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  machine: 'TMs',
  tutor: 'Tutor',
  egg: 'Egg',
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
  const isLevel = row.methodSlug === 'level-up';
  const when = isLevel ? moveLevelLabel(row.methodSlug, row.level) : machineLabel;

  return (
    <li className={`move-row${open ? ' is-open' : ''}${isLevel ? ' has-when' : ''}`}>
      <button className="move-row__summary" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {isLevel && <span className="move-row__when">{when}</span>}
        <span className="move-row__name">{humanizeApiName(row.moveSlug)}</span>
        {!isLevel && machineLabel && <span className="move-row__machine">{machineLabel}</span>}
        <svg className="move-row__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </button>

      {open && (
        <div className="move-row__details">
          {loading && <p className="muted">Loading…</p>}
          {error && <p className="pokemon-page__warning">Couldn't load this move.</p>}
          {detail && (
            <>
              <div className="move-facts">
                <span className={`pokemon-type pokemon-type--${detail.type.name}`}>{humanizeApiName(detail.type.name)}</span>
                <span>{humanizeApiName(detail.damage_class.name)}</span>
                <span>Power <strong>{detail.power ?? '—'}</strong></span>
                <span>Accuracy <strong>{detail.accuracy != null ? `${detail.accuracy}%` : '—'}</strong></span>
                <span>PP <strong>{detail.pp ?? '—'}</strong></span>
                {detail.priority !== 0 && <span>Priority <strong>{detail.priority > 0 ? `+${detail.priority}` : detail.priority}</strong></span>}
              </div>
              {effect && <p className="move-row__effect">{effect}</p>}
              <Link className="move-row__learners" to={`/tools/moves?move=${encodeURIComponent(row.moveSlug)}&vg=${encodeURIComponent(row.sourceVersionGroup)}`}>
                Who else learns this?
              </Link>
            </>
          )}
        </div>
      )}
    </li>
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
    <section className="panel pokemon-section pokemon-moves" id="moves" aria-labelledby="moves-title">
      <div className="pokemon-section__head">
        <h2 id="moves-title">Moves</h2>
        <span className="pokemon-section__context">{versionGroupLabel(versionGroup)}</span>
      </div>

      <div className="pokemon-moves__controls">
        <div className="segmented" role="tablist" aria-label="How it learns">
          {groupOrder.filter((key) => counts[key] > 0 || key === 'level-up').map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={group === key}
              className={group === key ? 'is-active' : undefined}
              onClick={() => setGroup(key)}
            >
              {groupLabels[key]} <span className="pokemon-moves__count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <input
          className="pokemon-moves__search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter moves"
          aria-label="Filter moves"
        />
      </div>

      {filteredRows.length ? (
        <ul className="move-list" role="tabpanel">
          {filteredRows.map((row) => (
            <MoveRow key={`${row.sourceVersionGroup}-${row.moveSlug}-${row.methodSlug}-${row.level}`} row={row} />
          ))}
        </ul>
      ) : (
        <p className="muted">{search.trim() ? `No ${groupLabels[group].toLowerCase()} moves match “${search.trim()}”.` : 'No moves listed for this game.'}</p>
      )}

      {group === 'level-up' && counts.egg === 0 && !breedingSupported && (
        <p className="pokemon-section__foot">No breeding in this game, so no Egg Moves.</p>
      )}
    </section>
  );
}
