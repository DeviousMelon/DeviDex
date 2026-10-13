import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  CollectionProgress,
  GameCollectionProgress,
  GameFormCollectionProgress,
} from '../types';

/**
 * Guests are allowed to use DeviDex normally, but their progress deliberately
 * lives only in React memory. It survives normal page navigation because this
 * provider sits above the router, but a refresh or closed tab clears it.
 *
 * Phase 6B keeps base-species and optional-form Game Dex progress separate in
 * memory for the same reason the database does: existing species saves stay
 * boring and stable while forms can be layered on safely.
 */
interface GuestProgressContextValue {
  nationalProgress: Record<number, CollectionProgress>;
  gameProgress: Record<number, Record<number, GameCollectionProgress>>;
  gameFormProgress: Record<number, Record<number, GameFormCollectionProgress>>;
  gameDexActivity: Record<number, number>;
  setNationalState: (formId: number, normalOwned: boolean, shinyOwned: boolean) => void;
  setGameState: (
    gameId: number,
    speciesId: number,
    normalOwned: boolean,
    shinyOwned: boolean,
  ) => void;
  setGameFormState: (
    gameId: number,
    formId: number,
    normalOwned: boolean,
    shinyOwned: boolean,
  ) => void;
  markGameDexStarted: (setId: number, gameId: number) => void;
  clearGuestProgress: () => void;
}

const GuestProgressContext = createContext<GuestProgressContextValue | undefined>(undefined);

export function GuestProgressProvider({ children }: { children: ReactNode }) {
  const [nationalProgress, setNationalProgress] = useState<Record<number, CollectionProgress>>({});
  const [gameProgress, setGameProgress] = useState<
    Record<number, Record<number, GameCollectionProgress>>
  >({});
  const [gameFormProgress, setGameFormProgress] = useState<
    Record<number, Record<number, GameFormCollectionProgress>>
  >({});
  const [gameDexActivity, setGameDexActivity] = useState<Record<number, number>>({});

  function setNationalState(formId: number, normalOwned: boolean, shinyOwned: boolean) {
    setNationalProgress((current) => ({
      ...current,
      [formId]: { formId, normalOwned, shinyOwned },
    }));
  }

  function setGameState(
    gameId: number,
    speciesId: number,
    normalOwned: boolean,
    shinyOwned: boolean,
  ) {
    setGameProgress((current) => ({
      ...current,
      [gameId]: {
        ...(current[gameId] ?? {}),
        [speciesId]: { speciesId, normalOwned, shinyOwned },
      },
    }));
  }

  function setGameFormState(
    gameId: number,
    formId: number,
    normalOwned: boolean,
    shinyOwned: boolean,
  ) {
    setGameFormProgress((current) => ({
      ...current,
      [gameId]: {
        ...(current[gameId] ?? {}),
        [formId]: { formId, normalOwned, shinyOwned },
      },
    }));
  }

  function markGameDexStarted(setId: number, gameId: number) {
    setGameDexActivity((current) => ({ ...current, [setId]: gameId }));
  }

  function clearGuestProgress() {
    setNationalProgress({});
    setGameProgress({});
    setGameFormProgress({});
    setGameDexActivity({});
  }

  const value = useMemo(
    () => ({
      nationalProgress,
      gameProgress,
      gameFormProgress,
      gameDexActivity,
      setNationalState,
      setGameState,
      setGameFormState,
      markGameDexStarted,
      clearGuestProgress,
    }),
    [nationalProgress, gameProgress, gameFormProgress, gameDexActivity],
  );

  return (
    <GuestProgressContext.Provider value={value}>
      {children}
    </GuestProgressContext.Provider>
  );
}

export function useGuestProgress() {
  const context = useContext(GuestProgressContext);
  if (!context) {
    throw new Error('useGuestProgress must be used inside <GuestProgressProvider>.');
  }
  return context;
}
