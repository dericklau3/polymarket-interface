export type PolymarketMarket = {
  id: string
  question: string
  slug: string
  endDate: string | null
  volume: number
  liquidity: number
  image: string | null
  outcomes: string[]
  outcomePrices: number[]
  category: string
  eventTitle: string | null
}

export type PolymarketPosition = {
  asset: string
  conditionId: string
  outcome: string
  title: string
  size: number
  avgPrice: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  curPrice: number
}

const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com'
const DATA_BASE_URL = 'https://data-api.polymarket.com'

function parseArrayField(value: string | string[] | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value

  try {
    return JSON.parse(value) as string[]
  } catch {
    return []
  }
}

export async function fetchMarkets(search = ''): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: '24',
    order: 'volume',
    ascending: 'false',
  })

  if (search.trim()) {
    params.set('search', search.trim())
  }

  const response = await fetch(`${GAMMA_BASE_URL}/markets?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch Polymarket markets')
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>

  return payload.map((item, index) => {
    const outcomes = parseArrayField(item.outcomes as string | string[] | null)
    const outcomePrices = parseArrayField(item.outcomePrices as string | string[] | null).map((entry) =>
      Number(entry),
    )

    return {
      id: String(item.id ?? index),
      question: String(item.question ?? 'Untitled market'),
      slug: String(item.slug ?? item.market_slug ?? index),
      endDate: typeof item.endDate === 'string' ? item.endDate : null,
      volume: Number(item.volume ?? item.volumeNum ?? 0),
      liquidity: Number(item.liquidity ?? 0),
      image: typeof item.image === 'string' ? item.image : null,
      outcomes,
      outcomePrices,
      category: String(item.category ?? item.groupItemTitle ?? 'General'),
      eventTitle: typeof item.events === 'object' && Array.isArray(item.events) && item.events[0]
        ? String((item.events[0] as Record<string, unknown>).title ?? '')
        : null,
    }
  })
}

export async function fetchPositions(user: string): Promise<PolymarketPosition[]> {
  const params = new URLSearchParams({ user, sizeThreshold: '0.1' })
  const response = await fetch(`${DATA_BASE_URL}/positions?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch user positions')
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>

  return payload.map((item) => ({
    asset: String(item.asset ?? ''),
    conditionId: String(item.conditionId ?? ''),
    outcome: String(item.outcome ?? 'Outcome'),
    title: String(item.title ?? 'Untitled position'),
    size: Number(item.size ?? 0),
    avgPrice: Number(item.avgPrice ?? 0),
    currentValue: Number(item.currentValue ?? 0),
    cashPnl: Number(item.cashPnl ?? 0),
    percentPnl: Number(item.percentPnl ?? 0),
    curPrice: Number(item.curPrice ?? 0),
  }))
}

export async function fetchPortfolioValue(user: string): Promise<number> {
  const params = new URLSearchParams({ user })
  const response = await fetch(`${DATA_BASE_URL}/value?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch user portfolio value')
  }

  const payload = (await response.json()) as Array<{ value?: number }>
  return Number(payload[0]?.value ?? 0)
}
