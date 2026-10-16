import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ToolCheck as Check, ToolPokemonSlot, ToolState, TypeBadge, clampInt as clamp, percent } from '../../components/tools/ToolBits';
import { useFormParam, useSearchParamState } from '../../hooks/useFormParam';
import { useReference } from '../../hooks/useReference';
import {
  CATCH_GENERATIONS,
  ballsForGeneration,
  catchChance,
  estimateMaxHp,
  throwsForConfidence,
  type BallContext,
  type CatchGeneration,
  type CatchStatus,
} from '../../lib/catchRate';
import { loadFormBattleData, loadTypeChart } from '../../lib/referenceClient';

const STATUSES: Array<{ id: CatchStatus; label: string }> = [
  { id: 'none', label: 'No status' },
  { id: 'sleep', label: 'Asleep' },
  { id: 'freeze', label: 'Frozen' },
  { id: 'paralysis', label: 'Paralysed' },
  { id: 'poison', label: 'Poisoned' },
  { id: 'burn', label: 'Burned' },
];

const genNumber = (generation: CatchGeneration) => (generation === '3-4' ? 4 : Number(generation));

export function CatchPage() {
  const [entry, setFormId] = useFormParam();
  const [generationParam, setGeneration] = useSearchParamState('gen', '9');
  const generation = (CATCH_GENERATIONS.some((item) => item.id === generationParam) ? generationParam : '9') as CatchGeneration;
  const gen = genNumber(generation);

  const [level, setLevel] = useState(30);
  const [hpPercent, setHpPercent] = useState(100);
  const [oneHp, setOneHp] = useState(false);
  const [status, setStatus] = useState<CatchStatus>('none');
  const [ctx, setCtx] = useState<BallContext>({
    turn: 1, nightOrCave: false, inWater: false, fishing: false, alreadyCaught: false, yourLevel: 50, sameSpeciesOppositeGender: false,
  });
  const [dexCaught, setDexCaught] = useState(400);
  const [catchingCharm, setCatchingCharm] = useState(false);
  const [power, setPower] = useState(1);
  const [swshPenalty, setSwshPenalty] = useState(false);
  const [badges, setBadges] = useState(8);
  const [capturePower, setCapturePower] = useState(1);
  const [offGuard, setOffGuard] = useState(false);

  const typeChart = useReference(loadTypeChart, []);
  const battle = useReference(
    () => (entry ? loadFormBattleData(entry.formId) : Promise.resolve(null)),
    [entry?.formId],
  );

  const target = useMemo(() => {
    const data = battle.data;
    if (!data || !typeChart.data || !data.species) return null;
    const typeById = new Map(typeChart.data.types.map((type) => [type.id, type]));
    const types = [data.pokemon.type1_id, data.pokemon.type2_id]
      .flatMap((id) => (id != null && typeById.get(id) ? [typeById.get(id)!] : []));
    return {
      types,
      baseHp: data.pokemon.hp,
      target: {
        catchRate: data.species.capture_rate,
        level,
        types: types.map((type) => type.slug),
        baseSpeed: data.pokemon.speed,
        weightKg: (data.pokemon.weight ?? 0) / 10,
        speciesSlug: entry?.speciesSlug ?? '',
      },
    };
  }, [battle.data, typeChart.data, level, entry?.speciesSlug]);

  const balls = useMemo(() => ballsForGeneration(generation), [generation]);
  const asks = new Set(balls.flatMap((ball) => ball.asks));
  const maxHp = target ? estimateMaxHp(target.baseHp, level) : 100;
  const currentHp = oneHp ? 1 : Math.max(1, Math.round((maxHp * hpPercent) / 100));

  const results = useMemo(() => {
    if (!target) return [];
    return balls
      .filter((ball) => ball.id !== 'master')
      .map((ball) => ({
        ball,
        result: catchChance({
          generation,
          target: target.target,
          maxHp,
          currentHp,
          ball: ball.id,
          ballContext: ctx,
          status,
          modifiers: {
            power,
            dexCaught,
            catchingCharm,
            swshLevelPenalty: swshPenalty,
            badges,
            svDifficulty: capturePower * (offGuard ? 2 : 1),
          },
        }),
      }))
      .sort((a, b) => b.result.perThrow - a.result.perThrow || a.ball.name.localeCompare(b.ball.name));
  }, [balls, badges, capturePower, catchingCharm, ctx, currentHp, dexCaught, generation, maxHp, offGuard, power, status, swshPenalty, target]);

  const pokeBall = results.find((row) => row.ball.id === 'poke');
  const setContext = <K extends keyof BallContext>(key: K, value: BallContext[K]) => setCtx((current) => ({ ...current, [key]: value }));

  return (
    <main className="tools-page">
      <PageHeader
        back={<Link to="/tools">← All tools</Link>}
        title="Catch odds"
        description="Pick a Pokémon and a game, set the situation, and every ball is ranked by its chance per throw."
      />

      <div className="tool-layout">
        <section className="panel tool-panel" aria-labelledby="catch-setup">
          <h2 id="catch-setup">Setup</h2>

          <ToolPokemonSlot entry={entry} label="Wild Pokémon" onPick={setFormId}>
            {target && (
              <span className="tool-slot__meta">
                {target.types.map((type) => <TypeBadge key={type.id} slug={type.slug} name={type.name} />)}
                <span>Catch rate <strong>{target.target.catchRate}</strong></span>
              </span>
            )}
          </ToolPokemonSlot>

          <label className="tool-field">
            <span>Game</span>
            <select value={generation} onChange={(event) => setGeneration(event.target.value)}>
              {CATCH_GENERATIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label} · {item.games}</option>
              ))}
            </select>
          </label>

          <div className="tool-field-row">
            <label className="tool-field">
              <span>Its level</span>
              <input type="number" min={1} max={100} value={level} onChange={(event) => setLevel(clamp(event.target.valueAsNumber, 1, 100))} />
            </label>
            <label className="tool-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as CatchStatus)}>
                {STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="tool-field">
            <span>HP left {oneHp ? '· 1 HP' : `· ${hpPercent}%`}</span>
            <input
              type="range" min={1} max={100} value={hpPercent} disabled={oneHp}
              aria-label="HP left, percent"
              onChange={(event) => setHpPercent(event.target.valueAsNumber)}
            />
            <label className="tool-check">
              <input type="checkbox" checked={oneHp} onChange={(event) => setOneHp(event.target.checked)} />
              <span>Down to 1 HP (False Swipe)</span>
            </label>
          </div>

          <fieldset className="tool-fieldset">
            <legend>Situation</legend>
            {asks.has('turn') && (
              <label className="tool-field tool-field--inline">
                <span>Turn</span>
                <input type="number" min={1} max={99} value={ctx.turn} onChange={(event) => setContext('turn', clamp(event.target.valueAsNumber, 1, 99))} />
              </label>
            )}
            {asks.has('nightOrCave') && <Check label="Night time, or in a cave" checked={ctx.nightOrCave} onChange={(value) => setContext('nightOrCave', value)} />}
            {asks.has('inWater') && <Check label="On or in water" checked={ctx.inWater} onChange={(value) => setContext('inWater', value)} />}
            {asks.has('fishing') && gen < 9 && <Check label="Hooked while fishing" checked={ctx.fishing} onChange={(value) => setContext('fishing', value)} />}
            {asks.has('alreadyCaught') && <Check label="You’ve caught this species before" checked={ctx.alreadyCaught} onChange={(value) => setContext('alreadyCaught', value)} />}
            {asks.has('sameSpeciesOppositeGender') && (
              <Check label="Your Pokémon is the same species, opposite gender" checked={ctx.sameSpeciesOppositeGender} onChange={(value) => setContext('sameSpeciesOppositeGender', value)} />
            )}
            {asks.has('yourLevel') && (
              <label className="tool-field tool-field--inline">
                <span>Your Pokémon’s level</span>
                <input type="number" min={1} max={100} value={ctx.yourLevel} onChange={(event) => setContext('yourLevel', clamp(event.target.valueAsNumber, 1, 100))} />
              </label>
            )}
          </fieldset>

          {gen >= 5 && (
            <fieldset className="tool-fieldset">
              <legend>Your game</legend>
              {gen >= 6 && (
                <label className="tool-field tool-field--inline">
                  <span>Species caught in your Pokédex</span>
                  <input type="number" min={0} max={1100} value={dexCaught} onChange={(event) => setDexCaught(clamp(event.target.valueAsNumber, 0, 1100))} />
                </label>
              )}
              {gen >= 8 && <Check label="Catching Charm" checked={catchingCharm} onChange={setCatchingCharm} />}
              {gen === 5 && (
                <label className="tool-field tool-field--inline">
                  <span>Capture Power (Entralink)</span>
                  <select value={power} onChange={(event) => setPower(Number(event.target.value))}>
                    <option value={1}>None</option><option value={1.1}>↑</option><option value={1.2}>↑↑</option><option value={1.3}>↑↑↑ / S / MAX</option>
                  </select>
                </label>
              )}
              {gen === 6 && (
                <label className="tool-field tool-field--inline">
                  <span>Capture O-Power</span>
                  <select value={power} onChange={(event) => setPower(Number(event.target.value))}>
                    <option value={1}>None</option><option value={1.5}>Lv. 1</option><option value={2}>Lv. 2</option><option value={2.5}>Lv. 3 / S / MAX</option>
                  </select>
                </label>
              )}
              {gen === 8 && (
                <Check
                  label="No 8th badge yet, and your Pokémon is lower level than it"
                  checked={swshPenalty}
                  onChange={setSwshPenalty}
                />
              )}
              {gen === 9 && (
                <>
                  <label className="tool-field tool-field--inline">
                    <span>Gym badges</span>
                    <input type="number" min={0} max={8} value={badges} onChange={(event) => setBadges(clamp(event.target.valueAsNumber, 0, 8))} />
                  </label>
                  <label className="tool-field tool-field--inline">
                    <span>Catching Power (sandwich)</span>
                    <select value={capturePower} onChange={(event) => setCapturePower(Number(event.target.value))}>
                      <option value={1}>None</option><option value={1.1}>Lv. 1</option><option value={1.25}>Lv. 2</option><option value={2}>Lv. 3</option>
                    </select>
                  </label>
                  <Check label="Caught it off guard (back strike)" checked={offGuard} onChange={setOffGuard} />
                </>
              )}
            </fieldset>
          )}
        </section>

        <section className="panel tool-panel" aria-labelledby="catch-results" aria-live="polite">
          <div className="panel__head">
            <h2 id="catch-results">Odds per throw</h2>
            {target && <span className="muted">≈{currentHp}/{maxHp} HP</span>}
          </div>

          {!entry && <p className="muted">Choose a Pokémon to see the odds.</p>}
          <ToolState loading={Boolean(entry) && (battle.loading || typeChart.loading)} error={battle.error ?? typeChart.error} />

          {target && (
            <>
              <ol className="ball-list">
                {results.map(({ ball, result }) => {
                  const needed = throwsForConfidence(result.perThrow, 0.9);
                  const better = pokeBall && result.perThrow > pokeBall.result.perThrow * 1.0001;
                  return (
                    <li key={ball.id} className={`ball-row${better ? ' is-better' : ''}`}>
                      <div className="ball-row__name">
                        <strong>{ball.name}</strong>
                        <span>{ball.note}</span>
                      </div>
                      <div className="ball-row__odds">
                        <strong>{percent(result.perThrow)}</strong>
                        <span className="ball-row__bar" aria-hidden="true"><i style={{ width: `${Math.max(1, result.perThrow * 100)}%` }} /></span>
                        <span className="ball-row__throws">
                          {result.guaranteed ? 'Guaranteed' : Number.isFinite(needed) ? `${needed} throw${needed === 1 ? '' : 's'} for 90%` : 'Can’t be caught'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="tool-footnote">
                The Master Ball never fails. Max HP is estimated with average IVs, so treat the last decimal loosely.
                {gen >= 6 && results[0] && results[0].result.criticalChance > 0 && (
                  <> Critical capture chance with the best ball: {percent(results[0].result.criticalChance)}.</>
                )}
                {gen === 5 && ' Gen V critical captures aren’t included.'}
                {' '}Let’s Go, Legends: Arceus and Legends: Z-A use different systems and aren’t covered.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
