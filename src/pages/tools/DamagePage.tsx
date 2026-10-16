import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ToolCheck, ToolPokemonSlot, ToolState, TypeBadge, clampInt } from '../../components/tools/ToolBits';
import { useFormParam, useSearchParamState } from '../../hooks/useFormParam';
import { useReference } from '../../hooks/useReference';
import {
  calcHp,
  calcStat,
  calculateDamage,
  koSummary,
  type NatureEffect,
  type Weather,
} from '../../lib/damageCalc';
import { loadFormBattleData, loadMoves, loadTypeChart } from '../../lib/referenceClient';
import { formatMultiplier, multiplierAgainst, type ChartType } from '../../lib/typeChart';
import type { RefPokemon } from '../../lib/referenceData';

type SideSettings = { level: number; iv: number; ev: number; nature: NatureEffect; stage: number; tera: string };

const DEFAULT_SIDE: SideSettings = { level: 50, iv: 31, ev: 0, nature: 'neutral', stage: 0, tera: '' };

export function DamagePage() {
  const [attackerEntry, setAttacker] = useFormParam('atk');
  const [defenderEntry, setDefender] = useFormParam('def');
  const [moveParam, setMoveParam] = useSearchParamState('move', '');

  const [atk, setAtk] = useState<SideSettings>({ ...DEFAULT_SIDE, ev: 252 });
  const [def, setDef] = useState<SideSettings>(DEFAULT_SIDE);
  const [hpEv, setHpEv] = useState(0);
  const [moveSearch, setMoveSearch] = useState('');
  const [critical, setCritical] = useState(false);
  const [spread, setSpread] = useState(false);
  const [burned, setBurned] = useState(false);
  const [weather, setWeather] = useState<Weather>('none');
  const [other, setOther] = useState(1);

  const reference = useReference(() => Promise.all([loadTypeChart(), loadMoves()]), []);
  const attacker = useReference(() => (attackerEntry ? loadFormBattleData(attackerEntry.formId) : Promise.resolve(null)), [attackerEntry?.formId]);
  const defender = useReference(() => (defenderEntry ? loadFormBattleData(defenderEntry.formId) : Promise.resolve(null)), [defenderEntry?.formId]);

  const chart = reference.data?.[0] ?? null;
  const typeById = useMemo(() => new Map((chart?.types ?? []).map((type) => [type.id, type])), [chart]);
  const damagingMoves = useMemo(
    () => (reference.data?.[1] ?? []).filter((move) => move.damage_class !== 'status' && move.power != null && move.power > 0),
    [reference.data],
  );
  const move = damagingMoves.find((item) => item.slug === moveParam) ?? null;
  const movesShown = useMemo(() => {
    const needle = moveSearch.trim().toLowerCase();
    const list = needle ? damagingMoves.filter((item) => item.name.toLowerCase().includes(needle)) : damagingMoves;
    // Keep the chosen move in the list so the select never goes blank.
    return move && !list.includes(move) ? [move, ...list] : list;
  }, [damagingMoves, move, moveSearch]);

  const attackerTypes = useMemo(() => typesOf(attacker.data?.pokemon, typeById), [attacker.data, typeById]);
  const defenderTypes = useMemo(() => typesOf(defender.data?.pokemon, typeById), [defender.data, typeById]);
  const moveType = move ? typeById.get(move.type_id) ?? null : null;

  const result = useMemo(() => {
    if (!chart || !move || !moveType || !attacker.data || !defender.data) return null;
    const a = attacker.data.pokemon;
    const d = defender.data.pokemon;
    const physical = move.damage_class === 'physical';
    const attackStat = calcStat(physical ? a.attack : a.special_attack, atk.level, atk.iv, atk.ev, atk.nature);
    const defenseStat = calcStat(physical ? d.defense : d.special_defense, def.level, def.iv, def.ev, def.nature);
    const hp = calcHp(d.hp, def.level, 31, hpEv);
    const defendingSlugs = def.tera ? [def.tera] : defenderTypes.map((type) => type.slug);
    const effectiveness = multiplierAgainst(chart, moveType.slug, defendingSlugs, 9);
    const damage = calculateDamage({
      level: atk.level,
      power: move.power ?? 0,
      category: physical ? 'physical' : 'special',
      moveType: moveType.slug,
      attackerTypes: attackerTypes.map((type) => type.slug),
      teraType: atk.tera || null,
      attackStat,
      attackStage: atk.stage,
      defenseStat,
      defenseStage: def.stage,
      effectiveness,
      critical,
      spread,
      weather,
      burned,
      otherModifier: other > 0 ? other : 1,
    });
    return { damage, hp, attackStat, defenseStat, effectiveness, physical };
  }, [atk, attacker.data, attackerTypes, burned, chart, critical, def, defender.data, defenderTypes, hpEv, move, moveType, other, spread, weather]);

  const teraOptions = (chart?.types ?? []).filter((type) => type.generation <= 9);

  return (
    <main className="tools-page">
      <PageHeader
        back={<Link to="/tools">← All tools</Link>}
        title="Damage calculator"
        description="Scarlet/Violet mechanics. Covers stats, natures, EVs, stat stages, STAB and Tera, type matchups, crits, spread moves, weather and burns."
      />

      <div className="tool-layout">
        <section className="panel tool-panel" aria-labelledby="attacker-title">
          <h2 id="attacker-title">Attacker</h2>
          <ToolPokemonSlot entry={attackerEntry} label="Attacker" onPick={setAttacker}>
            {attackerTypes.length > 0 && <span className="tool-slot__meta">{attackerTypes.map((type) => <TypeBadge key={type.id} slug={type.slug} name={type.name} />)}</span>}
          </ToolPokemonSlot>
          <ToolState loading={Boolean(attackerEntry) && attacker.loading} error={attacker.error} />

          <label className="tool-field">
            <span>Move</span>
            <input type="search" value={moveSearch} onChange={(event) => setMoveSearch(event.target.value)} placeholder="Search moves" aria-label="Search moves" />
            <select value={move?.slug ?? ''} onChange={(event) => setMoveParam(event.target.value)} aria-label="Move">
              <option value="">Choose a move…</option>
              {movesShown.map((item) => (
                <option key={item.id} value={item.slug}>{item.name} · {item.power} · {item.damage_class === 'physical' ? 'Phys' : 'Spec'}</option>
              ))}
            </select>
          </label>
          {move && moveType && (
            <p className="tool-slot__meta">
              <TypeBadge slug={moveType.slug} name={moveType.name} />
              <span>{move.damage_class === 'physical' ? 'Physical' : 'Special'} · Power <strong>{move.power}</strong></span>
            </p>
          )}

          <SideFields
            settings={atk}
            onChange={setAtk}
            statLabel={result?.physical === false || move?.damage_class === 'special' ? 'Sp. Atk' : 'Attack'}
            teraOptions={teraOptions}
          />
        </section>

        <section className="panel tool-panel" aria-labelledby="defender-title">
          <h2 id="defender-title">Defender</h2>
          <ToolPokemonSlot entry={defenderEntry} label="Defender" onPick={setDefender}>
            {defenderTypes.length > 0 && <span className="tool-slot__meta">{defenderTypes.map((type) => <TypeBadge key={type.id} slug={type.slug} name={type.name} />)}</span>}
          </ToolPokemonSlot>
          <ToolState loading={Boolean(defenderEntry) && defender.loading} error={defender.error} />

          <label className="tool-field">
            <span>HP EVs</span>
            <input type="number" min={0} max={252} step={4} value={hpEv} onChange={(event) => setHpEv(clampInt(event.target.valueAsNumber, 0, 252))} />
          </label>
          <SideFields
            settings={def}
            onChange={setDef}
            statLabel={move?.damage_class === 'special' ? 'Sp. Def' : 'Defense'}
            teraOptions={teraOptions}
          />
        </section>
      </div>

      <section className="panel tool-panel" aria-labelledby="field-title">
        <h2 id="field-title">Battle</h2>
        <div className="tool-inline-fields">
          <ToolCheck label="Critical hit" checked={critical} onChange={setCritical} />
          <ToolCheck label="Spread move (doubles)" checked={spread} onChange={setSpread} />
          <ToolCheck label="Attacker is burned" checked={burned} onChange={setBurned} />
          <label className="tool-field tool-field--inline">
            <span>Weather</span>
            <select value={weather} onChange={(event) => setWeather(event.target.value as Weather)}>
              <option value="none">None</option><option value="sun">Sun</option><option value="rain">Rain</option>
            </select>
          </label>
          <label className="tool-field tool-field--inline">
            <span>Other multiplier</span>
            <input type="number" min={0.1} max={4} step={0.1} value={other} onChange={(event) => setOther(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 1)} />
          </label>
        </div>
      </section>

      <section className="panel tool-panel damage-result" aria-labelledby="result-title" aria-live="polite">
        <h2 id="result-title">Result</h2>
        <ToolState loading={reference.loading} error={reference.error} />
        {!result && !reference.loading && <p className="muted">Choose an attacker, a move and a defender.</p>}
        {result && (
          <>
            <p className="damage-result__range">
              <strong>{result.damage.min}–{result.damage.max}</strong> damage
              <span> ({pct(result.damage.min, result.hp)}–{pct(result.damage.max, result.hp)} of {result.hp} HP)</span>
            </p>
            <p className="damage-result__ko">{result.damage.immune ? 'It’s immune.' : koSummary(result.damage.rolls, result.hp)}</p>
            <p className="tool-footnote">
              {formatMultiplier(result.effectiveness)} effective · {result.physical ? 'Attack' : 'Sp. Atk'} {result.attackStat} vs {result.physical ? 'Defense' : 'Sp. Def'} {result.defenseStat}
              {' '}· rolls: {result.damage.rolls.join(', ')}
            </p>
          </>
        )}
        <p className="tool-footnote">Abilities, held items, terrain and variable-power moves aren’t modelled. Use “Other multiplier” for things like Choice Band (1.5).</p>
      </section>
    </main>
  );
}

function typesOf(pokemon: RefPokemon | undefined, typeById: Map<number, ChartType>): ChartType[] {
  if (!pokemon) return [];
  return [pokemon.type1_id, pokemon.type2_id].flatMap((id) => (id != null && typeById.get(id) ? [typeById.get(id)!] : []));
}

function pct(damage: number, hp: number) {
  return `${Math.round((damage / hp) * 1000) / 10}%`;
}

function SideFields({
  settings, onChange, statLabel, teraOptions,
}: {
  settings: SideSettings;
  onChange: (next: SideSettings) => void;
  statLabel: string;
  teraOptions: ChartType[];
}) {
  const set = <K extends keyof SideSettings>(key: K, value: SideSettings[K]) => onChange({ ...settings, [key]: value });
  return (
    <div className="tool-field-grid">
      <label className="tool-field">
        <span>Level</span>
        <input type="number" min={1} max={100} value={settings.level} onChange={(event) => set('level', clampInt(event.target.valueAsNumber, 1, 100))} />
      </label>
      <label className="tool-field">
        <span>{statLabel} EVs</span>
        <input type="number" min={0} max={252} step={4} value={settings.ev} onChange={(event) => set('ev', clampInt(event.target.valueAsNumber, 0, 252))} />
      </label>
      <label className="tool-field">
        <span>{statLabel} IV</span>
        <input type="number" min={0} max={31} value={settings.iv} onChange={(event) => set('iv', clampInt(event.target.valueAsNumber, 0, 31))} />
      </label>
      <label className="tool-field">
        <span>Nature</span>
        <select value={settings.nature} onChange={(event) => set('nature', event.target.value as NatureEffect)}>
          <option value="neutral">Neutral</option>
          <option value="boost">+{statLabel}</option>
          <option value="hinder">−{statLabel}</option>
        </select>
      </label>
      <label className="tool-field">
        <span>{statLabel} stage</span>
        <select value={settings.stage} onChange={(event) => set('stage', Number(event.target.value))}>
          {[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map((stage) => (
            <option key={stage} value={stage}>{stage > 0 ? `+${stage}` : stage}</option>
          ))}
        </select>
      </label>
      <label className="tool-field">
        <span>Tera type</span>
        <select value={settings.tera} onChange={(event) => set('tera', event.target.value)}>
          <option value="">Not Terastallized</option>
          {teraOptions.map((type) => <option key={type.id} value={type.slug}>{type.name}</option>)}
        </select>
      </label>
    </div>
  );
}
