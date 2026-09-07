import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  convertLegacyPurchase,
  deleteTransaction,
  editTransaction,
  getDadReport,
  getFinanceAnalytics,
  getFinanceInsights,
  getFinanceOverview,
  getFinanceTransactions,
  getFinanceVerify,
  getLegacyPurchases,
  postAdjustment,
  postExpense,
  postMoneyIn,
  putOpeningBalance,
  saveFinanceSettings,
} from '../api/endpoints'
import type { TransactionFilters } from '../api/endpoints'
import type { WalletKey } from '../api/types'

export type { TransactionFilters }

function useInvalidateFinance() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['finance'] })
    // Day scores re-stamp when ledger expenses change.
    qc.invalidateQueries({ queryKey: ['day'] })
    qc.invalidateQueries({ queryKey: ['days'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
  }
}

export function useFinanceOverview() {
  return useQuery({ queryKey: ['finance', 'overview'], queryFn: getFinanceOverview })
}

export function useFinanceTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['finance', 'transactions', filters],
    queryFn: () => getFinanceTransactions(filters),
  })
}

export function useFinanceAnalytics(query: string) {
  return useQuery({ queryKey: ['finance', 'analytics', query], queryFn: () => getFinanceAnalytics(query) })
}

export function useFinanceInsights(query: string) {
  return useQuery({ queryKey: ['finance', 'insights', query], queryFn: () => getFinanceInsights(query) })
}

export function useDadReport(query: string, enabled = true) {
  return useQuery({ queryKey: ['finance', 'dad', query], queryFn: () => getDadReport(query), enabled })
}

export function useLegacyPurchases() {
  return useQuery({ queryKey: ['finance', 'legacy'], queryFn: getLegacyPurchases })
}

export function useFinanceVerify() {
  return useQuery({ queryKey: ['finance', 'verify'], queryFn: getFinanceVerify })
}

export function useAddMoney() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: postMoneyIn,
    onSuccess: invalidate,
  })
}

export function useAddExpense() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: postExpense,
    onSuccess: invalidate,
  })
}

export function useEditTransaction() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof editTransaction>[1] }) => editTransaction(id, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance()
  return useMutation({ mutationFn: (id: string) => deleteTransaction(id), onSuccess: invalidate })
}

export function useOpeningBalance() {
  const invalidate = useInvalidateFinance()
  return useMutation({ mutationFn: putOpeningBalance, onSuccess: invalidate })
}

export function useAdjustment() {
  const invalidate = useInvalidateFinance()
  return useMutation({ mutationFn: postAdjustment, onSuccess: invalidate })
}

export function useConvertLegacy() {
  const invalidate = useInvalidateFinance()
  return useMutation({ mutationFn: convertLegacyPurchase, onSuccess: invalidate })
}

export function useSaveFinanceSettings() {
  const invalidate = useInvalidateFinance()
  return useMutation({ mutationFn: saveFinanceSettings, onSuccess: invalidate })
}

export function walletOf(overview: { wallets: { key: WalletKey; balancePaise: number }[] } | undefined, key: WalletKey): number {
  return overview?.wallets.find((w) => w.key === key)?.balancePaise ?? 0
}
