import { APP_CHAIN } from './chains'

const STORAGE_KEY = `polymarket-created-predictions:${APP_CHAIN.chainId}`

export type StoredPrediction = {
  txHash: string
  questionId: string
  conditionId: string
  adapterVersion: 'v2' | 'v3'
  marketTitle: string
  option: string
  title: string
  description: string
  outcomes: string[]
  rewardToken: string
  reward: string
  proposalBond: string
  chainId: number
  creator: string | null
  createdAt: string
  status: 'created' | 'open' | 'resolved'
}

export function loadStoredPredictions(): StoredPrediction[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredPrediction[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredPredictions(items: StoredPrediction[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function upsertStoredPrediction(item: StoredPrediction): StoredPrediction[] {
  const current = loadStoredPredictions()
  const next = [item, ...current.filter((entry) => entry.txHash !== item.txHash)]
  saveStoredPredictions(next)
  return next
}
