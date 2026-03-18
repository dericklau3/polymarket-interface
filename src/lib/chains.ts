export type ChainConfig = {
  chainId: number
  name: string
  rpcUrl: string
  blockExplorerUrl: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: 18
  }
}

export const APP_CHAIN: ChainConfig = {
  chainId: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  blockExplorerUrl: 'https://sepolia.basescan.org',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
}

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as const
}
