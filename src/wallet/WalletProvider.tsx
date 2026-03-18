import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BrowserProvider } from 'ethers'
import { APP_CHAIN, toHexChainId } from '../lib/chains'
import {
  requestEip6963Providers,
  subscribeEip6963Providers,
  type EIP1193Provider,
  type EIP6963ProviderDetail,
} from '../lib/eip6963'

type WalletStatus = 'idle' | 'connecting' | 'connected' | 'error'

type WalletContextValue = {
  providers: EIP6963ProviderDetail[]
  selectedProvider: EIP6963ProviderDetail | null
  account: string | null
  chainId: number | null
  status: WalletStatus
  error: string | null
  refreshProviders: () => void
  connect: (detail: EIP6963ProviderDetail) => Promise<void>
  disconnect: () => void
  ensureTargetChain: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

type ListenerRef = {
  provider: EIP1193Provider | null
  accountsChanged?: (accounts: string[]) => void
  chainChanged?: (chainIdHex: string) => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Wallet request failed'
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([])
  const [selectedProvider, setSelectedProvider] = useState<EIP6963ProviderDetail | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [status, setStatus] = useState<WalletStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const listenersRef = useRef<ListenerRef>({ provider: null })

  const cleanupListeners = () => {
    const current = listenersRef.current
    if (!current.provider) return

    if (current.accountsChanged) {
      current.provider.removeListener?.('accountsChanged', current.accountsChanged)
    }

    if (current.chainChanged) {
      current.provider.removeListener?.('chainChanged', current.chainChanged)
    }

    listenersRef.current = { provider: null }
  }

  useEffect(() => {
    const { unsubscribe } = subscribeEip6963Providers((detail) => {
      setProviders((prev) => {
        if (prev.some((item) => item.info.uuid === detail.info.uuid)) {
          return prev
        }

        return [...prev, detail].sort((left, right) => left.info.name.localeCompare(right.info.name))
      })
    })

    return () => {
      cleanupListeners()
      unsubscribe()
    }
  }, [])

  const disconnect = () => {
    cleanupListeners()
    setSelectedProvider(null)
    setAccount(null)
    setChainId(null)
    setStatus('idle')
    setError(null)
  }

  const ensureTargetChainForProvider = async (provider: EIP1193Provider) => {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: toHexChainId(APP_CHAIN.chainId) }],
      })
    } catch (error: any) {
      if (error?.code !== 4902) throw error

      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: toHexChainId(APP_CHAIN.chainId),
            chainName: APP_CHAIN.name,
            rpcUrls: [APP_CHAIN.rpcUrl],
            nativeCurrency: APP_CHAIN.nativeCurrency,
            blockExplorerUrls: [APP_CHAIN.blockExplorerUrl],
          },
        ],
      })
    }
  }

  const connect = async (detail: EIP6963ProviderDetail) => {
    cleanupListeners()
    setSelectedProvider(detail)
    setStatus('connecting')
    setError(null)

    try {
      await detail.provider.request({ method: 'eth_requestAccounts' })

      const browserProvider = new BrowserProvider(detail.provider as any)
      const signer = await browserProvider.getSigner()
      const nextAccount = await signer.getAddress()
      const network = await browserProvider.getNetwork()
      const nextChainId = Number(network.chainId)

      const handleAccountsChanged = (accounts: string[]) => {
        setAccount(accounts[0] ?? null)
        if (!accounts[0]) {
          setStatus('idle')
          setSelectedProvider(null)
        }
      }

      const handleChainChanged = (chainIdHex: string) => {
        const parsedChainId = Number.parseInt(chainIdHex, 16)
        setChainId(Number.isFinite(parsedChainId) ? parsedChainId : null)
      }

      detail.provider.on?.('accountsChanged', handleAccountsChanged)
      detail.provider.on?.('chainChanged', handleChainChanged)

      listenersRef.current = {
        provider: detail.provider,
        accountsChanged: handleAccountsChanged,
        chainChanged: handleChainChanged,
      }

      setAccount(nextAccount)
      setChainId(nextChainId)
      setStatus('connected')

      if (nextChainId !== APP_CHAIN.chainId) {
        await ensureTargetChainForProvider(detail.provider)
      }
    } catch (connectError) {
      cleanupListeners()
      setStatus('error')
      setError(getErrorMessage(connectError))
    }
  }

  const ensureTargetChain = async () => {
    if (!selectedProvider) return

    try {
      await ensureTargetChainForProvider(selectedProvider.provider)
      setChainId(APP_CHAIN.chainId)
    } catch (switchError) {
      setError(getErrorMessage(switchError))
    }
  }

  const value: WalletContextValue = {
    providers,
    selectedProvider,
    account,
    chainId,
    status,
    error,
    refreshProviders: requestEip6963Providers,
    connect,
    disconnect,
    ensureTargetChain,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used inside WalletProvider')
  }

  return context
}
