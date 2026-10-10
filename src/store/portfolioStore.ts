import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Instrument, InstrumentKey, Transaction } from '@/domain/types';
import { jsonStorage } from './storage';

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;

interface PortfolioState {
  transactions: Transaction[];
  /** Names and currencies learned when trades were validated against the API. */
  instruments: Record<InstrumentKey, Instrument>;
  addTransaction: (input: NewTransaction) => Transaction;
  removeTransaction: (id: string) => void;
  upsertInstrument: (instrument: Instrument) => void;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      transactions: [],
      instruments: {},
      addTransaction: (input) => {
        const transaction: Transaction = {
          ...input,
          symbol: input.symbol.trim().toUpperCase(),
          exchange: input.exchange?.trim() || undefined,
          id: newId(),
          createdAt: Date.now(),
        };
        set((s) => ({ transactions: [...s.transactions, transaction] }));
        return transaction;
      },
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      upsertInstrument: (instrument) =>
        set((s) => ({ instruments: { ...s.instruments, [instrument.key]: instrument } })),
    }),
    { name: 'portfolio', version: 1, storage: jsonStorage },
  ),
);
