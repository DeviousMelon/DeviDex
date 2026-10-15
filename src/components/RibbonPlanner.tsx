import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pokemonLabel, usePokemonCatalog, type PokemonCatalog } from '../hooks/usePokemonCatalog';
import { useNow } from '../hooks/useNow';
import { addRibbonPlan, bankIsOpen, getRibbonPlans, removeRibbonPlan, updateRibbonPlan, type RibbonPlan } from '../lib/bank';
import {
  DOORS,
  ORIGINS,
  STAGE_LABELS,
  STAGE_ORDER,
  isStageBefore,
  nextStage,
  originById,
  planProgress,
  previousStage,
  startStage,
  type RibbonOrigin,
  type RibbonStage,
} from '../lib/bankRibbons';
import { PokemonPicker } from './PokemonPicker';
import { PokemonSprite } from './PokemonSprite';

/** Doors that go through Poké Transporter or Bank, and so die with Bank. */
const BANK_DOORS: RibbonStage[] = ['gen5', 'gen6', 'gen7'];

export function RibbonPlanner() {
  const { user } = useAuth();
  const { catalog } = usePokemonCatalog();
  const [plans, setPlans] = useState<RibbonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [origin, setOrigin] = useState<RibbonOrigin>('rse');
  const [pick, setPick] = useState<{ formId: number; shiny: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getRibbonPlans();
    setPlans(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!user || !label.trim()) return;
    setSaving(true);
    const result = await addRibbonPlan(user.id, {
      label,
      formId: pick?.formId ?? null,
      shiny: pick?.shiny ?? false,
      origin,
      stage: startStage(origin),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLabel('');
    setPick(null);
    await load();
  }

  const save = useCallback(async (plan: RibbonPlan, changes: Parameters<typeof updateRibbonPlan>[1]) => {
    setPlans((current) => current.map((row) => (row.id === plan.id ? { ...row, ...changes } : row)));
    const result = await updateRibbonPlan(plan.id, changes);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }, [load]);

  async function remove(plan: RibbonPlan) {
    if (!window.confirm(`Delete the plan for ${plan.label}? Your ribbon ticks for it go too.`)) return;
    setPlans((current) => current.filter((row) => row.id !== plan.id));
    const result = await removeRibbonPlan(plan.id);
    if (result.error) {
      setError(result.error);
      await load();
    }
  }

  const picked = pick ? catalog?.byFormId.get(pick.formId) : undefined;
  const active = plans.filter((plan) => plan.currentStage !== 'home');
  const finished = plans.filter((plan) => plan.currentStage === 'home');

  return (
    <section className="bank-section" id="ribbon-masters" aria-labelledby="ribbons-title">
      <div className="bank-section__head">
        <div>
          <h2 id="ribbons-title">Ribbon Masters</h2>
          <p className="muted">
            Every ribbon from Gen 3 to Gen 7 has to be earned before the Pokémon leaves for HOME. The planner walks the
            route in order and locks each one-way door until that generation is done.
          </p>
        </div>
      </div>

      {error && <p className="form-message form-message--error">{error}</p>}

      <form className="bank-add bank-add--plan" onSubmit={(event) => void add(event)}>
        <div className="bank-add__pokemon">
          <button type="button" className="bank-add__pick" onClick={() => setPicking(true)} aria-label={picked ? `Change Pokémon, currently ${pokemonLabel(picked)}` : 'Pick a Pokémon (optional)'}>
            {picked ? (
              <PokemonSprite nationalDexNumber={picked.dexNumber} name={pokemonLabel(picked)} shiny={pick?.shiny} spriteUrl={picked.spriteUrl} shinySpriteUrl={picked.shinySpriteUrl} />
            ) : <span aria-hidden="true">+</span>}
          </button>
          <label>
            <span>Which Pokémon?</span>
            <input required maxLength={60} value={label} placeholder="e.g. Emerald starter Treecko" onChange={(event) => setLabel(event.target.value)} />
          </label>
        </div>
        <label>
          <span>Caught or hatched in</span>
          <select value={origin} onChange={(event) => setOrigin(event.target.value as RibbonOrigin)}>
            {ORIGINS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <button className="button button--primary button--small" type="submit" disabled={saving || !label.trim()}>
          {saving ? 'Starting…' : 'Start plan'}
        </button>
      </form>

      <p className="bank-draft-note">
        The ribbon list is a first draft. Spot a wrong or missing ribbon? <Link to="/forums">Tell us in the forums</Link>.
      </p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : plans.length === 0 ? (
        <div className="social-empty">
          <strong>No plans yet.</strong>
          <span>Start one for each Pokémon you want to take all the way, from its origin game to HOME.</span>
        </div>
      ) : (
        <div className="ribbon-plans">
          {active.map((plan) => (
            <RibbonPlanCard key={plan.id} plan={plan} catalog={catalog} onSave={save} onRemove={remove} />
          ))}
          {finished.length > 0 && (
            <details className="bank-moved">
              <summary>Made it to HOME ({finished.length})</summary>
              <div className="ribbon-plans">
                {finished.map((plan) => (
                  <RibbonPlanCard key={plan.id} plan={plan} catalog={catalog} onSave={save} onRemove={remove} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <PokemonPicker
        open={picking}
        title="Which Pokémon is this plan for?"
        confirmLabel="Use this one"
        onClose={() => setPicking(false)}
        onPick={(choice) => {
          setPicking(false);
          setPick(choice);
          const entry = catalog?.byFormId.get(choice.formId);
          if (!label.trim() && entry) setLabel(pokemonLabel(entry));
        }}
      />
    </section>
  );
}

type CardProps = {
  plan: RibbonPlan;
  catalog: PokemonCatalog | null;
  onSave: (plan: RibbonPlan, changes: Parameters<typeof updateRibbonPlan>[1]) => Promise<void>;
  onRemove: (plan: RibbonPlan) => Promise<void>;
};

function RibbonPlanCard({ plan, catalog, onSave, onRemove }: CardProps) {
  const open = bankIsOpen(useNow(60_000));
  const pokemon = plan.formId != null ? catalog?.byFormId.get(plan.formId) : undefined;
  const progress = useMemo(
    () => planProgress(plan.origin, plan.completedRibbons, plan.skippedRibbons),
    [plan.origin, plan.completedRibbons, plan.skippedRibbons],
  );
  const done = new Set(plan.completedRibbons);
  const skipped = new Set(plan.skippedRibbons);
  const stage = plan.currentStage;
  const here = progress.stages.find((row) => row.stage === stage);
  const ahead = progress.stages.filter((row) => isStageBefore(stage, row.stage) && row.ribbons.length > 0);
  const next = nextStage(stage);
  const back = previousStage(stage, plan.origin);
  const start = startStage(plan.origin);
  const route = STAGE_ORDER.slice(STAGE_ORDER.indexOf(start));
  const doorClosed = stage !== 'home' && !open && BANK_DOORS.includes(stage);
  const percent = progress.target ? Math.round((progress.earned / progress.target) * 100) : 0;

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof here>['ribbons']>();
    for (const ribbon of here?.ribbons ?? []) {
      map.set(ribbon.group, [...(map.get(ribbon.group) ?? []), ribbon]);
    }
    return [...map.entries()];
  }, [here]);

  function toggle(list: 'completedRibbons' | 'skippedRibbons', id: string) {
    const current = list === 'completedRibbons' ? plan.completedRibbons : plan.skippedRibbons;
    const nextList = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    // Done and skipped are exclusive.
    const other = list === 'completedRibbons' ? 'skippedRibbons' : 'completedRibbons';
    const otherList = (list === 'completedRibbons' ? plan.skippedRibbons : plan.completedRibbons).filter((item) => item !== id);
    void onSave(plan, { [list]: nextList, [other]: otherList });
  }

  function moveOn() {
    if (!next || !here) return;
    const door = DOORS[stage as Exclude<RibbonStage, 'home'>];
    if (here.remaining > 0 && !window.confirm(
      `${here.remaining} ${here.remaining === 1 ? 'ribbon is' : 'ribbons are'} still open in ${STAGE_LABELS[stage].short}. `
      + `${door.name} is one-way, so ${plan.label} can never come back for ${here.remaining === 1 ? 'it' : 'them'}. Move it anyway?`,
    )) return;
    void onSave(plan, { currentStage: next });
  }

  return (
    <article className={`ribbon-plan${stage === 'home' ? ' is-finished' : ''}`} aria-label={`Ribbon Master plan: ${plan.label}`}>
      <header className="ribbon-plan__head">
        {pokemon ? (
          <PokemonSprite nationalDexNumber={pokemon.dexNumber} name={pokemonLabel(pokemon)} shiny={plan.shiny} spriteUrl={pokemon.spriteUrl} shinySpriteUrl={pokemon.shinySpriteUrl} />
        ) : <span className="bank-list__blank" aria-hidden="true" />}
        <div className="ribbon-plan__title">
          <h3>{plan.shiny && <span className="bank-shiny" title="Shiny">✦ </span>}{plan.label}</h3>
          <small>From {originById(plan.origin)?.label ?? plan.origin}</small>
        </div>
        <div className="ribbon-plan__score" aria-label={`${progress.earned} of ${progress.target} ribbons`}>
          <strong>{progress.earned}<small>/{progress.target}</small></strong>
          <span className="meter"><span style={{ width: `${percent}%` }} /></span>
        </div>
      </header>

      <ol className="ribbon-route" aria-label="Route">
        {route.map((step) => (
          <li
            key={step}
            className={step === stage ? 'is-current' : isStageBefore(step, stage) ? 'is-done' : undefined}
            aria-current={step === stage ? 'step' : undefined}
          >
            {STAGE_LABELS[step].short}
          </li>
        ))}
      </ol>

      {stage === 'home' ? (
        <p className="ribbon-plan__finished">
          Safely in HOME with {progress.earned} of {progress.target} ribbons.
        </p>
      ) : (
        <>
          <div className="ribbon-plan__stage">
            <h4>Now in {STAGE_LABELS[stage].long}</h4>
            {groups.length === 0 ? (
              <p className="muted">Nothing to earn here. {stage === 'gen5' ? 'Gen 5 is just the bridge to Poké Transporter.' : 'Move on when you\'re ready.'}</p>
            ) : groups.map(([group, ribbons]) => (
              <fieldset key={group} className="ribbon-group">
                <legend>{group}</legend>
                <ul>
                  {ribbons.map((ribbon) => {
                    const isDone = done.has(ribbon.id);
                    const isSkipped = skipped.has(ribbon.id);
                    return (
                      <li key={ribbon.id} className={ribbon.unobtainable ? 'is-unobtainable' : isSkipped ? 'is-skipped' : isDone ? 'is-done' : undefined}>
                        <label>
                          <input
                            type="checkbox"
                            checked={isDone}
                            disabled={ribbon.unobtainable}
                            onChange={() => toggle('completedRibbons', ribbon.id)}
                          />
                          <span>
                            <strong>{ribbon.name}</strong>
                            <small>{ribbon.how}</small>
                          </span>
                        </label>
                        {!ribbon.unobtainable && !isDone && (
                          <button className="text-button text-button--quiet" type="button" onClick={() => toggle('skippedRibbons', ribbon.id)}>
                            {isSkipped ? 'Unskip' : 'Skip'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>

          {next && (
            <div className={`ribbon-door${here && here.remaining > 0 ? ' is-locked' : ' is-open'}`}>
              <div>
                {here && here.remaining > 0 ? (
                  <p className="ribbon-door__warning">
                    Do not transfer yet. {here.remaining} {here.remaining === 1 ? 'ribbon' : 'ribbons'} left in {STAGE_LABELS[stage].short}.
                  </p>
                ) : (
                  <p className="ribbon-door__ready">{STAGE_LABELS[stage].short} done. Safe to move on.</p>
                )}
                <p className="ribbon-door__how">
                  <strong>Next door: {DOORS[stage as Exclude<RibbonStage, 'home'>].name}.</strong>{' '}
                  {DOORS[stage as Exclude<RibbonStage, 'home'>].how}
                </p>
              </div>
              <button
                className={`button button--small ${here && here.remaining > 0 ? 'button--secondary' : 'button--primary'}`}
                type="button"
                disabled={doorClosed}
                onClick={moveOn}
              >
                {doorClosed ? 'Bank has closed' : `Moved to ${STAGE_LABELS[next].short}`}
              </button>
            </div>
          )}

          {ahead.length > 0 && (
            <p className="ribbon-plan__ahead">
              Still ahead: {ahead.map((row) => `${STAGE_LABELS[row.stage].short} · ${row.ribbons.filter((r) => !r.unobtainable).length}`).join(', ')}
            </p>
          )}
        </>
      )}

      <footer className="ribbon-plan__foot">
        <input
          aria-label={`Notes for ${plan.label}`}
          defaultValue={plan.notes ?? ''}
          maxLength={500}
          placeholder="Notes: nature, ball, where it's stored…"
          onBlur={(event) => {
            if ((plan.notes ?? '') !== event.target.value.trim()) void onSave(plan, { notes: event.target.value });
          }}
        />
        {back && (
          <button className="text-button text-button--quiet" type="button" onClick={() => void onSave(plan, { currentStage: back })}>
            Back a step
          </button>
        )}
        <button className="text-button text-button--danger" type="button" onClick={() => void onRemove(plan)}>Delete</button>
      </footer>
    </article>
  );
}
