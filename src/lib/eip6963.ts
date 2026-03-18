export type EIP6963ProviderInfo = {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
  on?: (event: string, listener: (...args: any[]) => void) => void
  removeListener?: (event: string, listener: (...args: any[]) => void) => void
}

export type EIP6963ProviderDetail = {
  info: EIP6963ProviderInfo
  provider: EIP1193Provider
}

declare global {
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<EIP6963ProviderDetail>
  }
}

export function requestEip6963Providers(): void {
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

export function subscribeEip6963Providers(
  onProvider: (detail: EIP6963ProviderDetail) => void,
): { unsubscribe: () => void } {
  const handler = (event: WindowEventMap['eip6963:announceProvider']) => {
    onProvider(event.detail)
  }

  window.addEventListener('eip6963:announceProvider', handler as EventListener)
  requestEip6963Providers()

  return {
    unsubscribe: () => {
      window.removeEventListener('eip6963:announceProvider', handler as EventListener)
    },
  }
}
