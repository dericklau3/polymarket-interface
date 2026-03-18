import { JsonRpcProvider, formatEther } from 'ethers'
import { APP_CHAIN } from './chains'

export type WalletAsset = {
  symbol: string
  balance: string
}

const baseProvider = new JsonRpcProvider(APP_CHAIN.rpcUrl, APP_CHAIN.chainId)

export async function getWalletAssets(address: string): Promise<WalletAsset[]> {
  const nativeBalance = await baseProvider.getBalance(address)

  return [
    {
      symbol: APP_CHAIN.nativeCurrency.symbol,
      balance: Number(formatEther(nativeBalance)).toFixed(4),
    },
  ]
}
