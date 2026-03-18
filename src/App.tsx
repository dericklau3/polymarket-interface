import { BrowserProvider } from 'ethers'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getWalletAssets, type WalletAsset } from './lib/evm'
import { shortenAddress } from './lib/format'
import { APP_CHAIN } from './lib/chains'
import { createPrediction, ensureRewardTokenAllowance, type CreatePredictionResult } from './lib/prediction'
import { loadStoredPredictions, upsertStoredPrediction, type StoredPrediction } from './lib/storage'
import { useWallet } from './wallet/WalletProvider'

const CATEGORY_ITEMS = ['All', 'Created', 'Open', 'Resolved'] as const
const BASE_SEPOLIA_USDC = '0x8542FC3a56280a3795990E243c2f99Eb2eBcD51E'

function App() {
  const wallet = useWallet()
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_ITEMS)[number]>('All')
  const [assets, setAssets] = useState<WalletAsset[]>([])
  const [walletPanelOpen, setWalletPanelOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createPhase, setCreatePhase] = useState<'idle' | 'approving' | 'submitting'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createResults, setCreateResults] = useState<Array<CreatePredictionResult & { option: string }>>([])
  const [storedPredictions, setStoredPredictions] = useState<StoredPrediction[]>([])
  const [selectedPrediction, setSelectedPrediction] = useState<StoredPrediction | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    outcomes: 'Yes,No',
    rewardToken: BASE_SEPOLIA_USDC,
    reward: '2',
    proposalBond: '750',
  })
  const [options, setOptions] = useState([''])
  const walletPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setStoredPredictions(loadStoredPredictions())
  }, [])

  useEffect(() => {
    if (!wallet.account) {
      setAssets([])
      setCreateModalOpen(false)
      return
    }

    void getWalletAssets(wallet.account).then(setAssets).catch(() => setAssets([]))
  }, [wallet.account])

  useEffect(() => {
    if (!walletPanelOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!walletPanelRef.current) return
      if (walletPanelRef.current.contains(event.target as Node)) return
      setWalletPanelOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [walletPanelOpen])

  const outcomes = useMemo(() => {
    return form.outcomes
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }, [form.outcomes])

  const optionItems = useMemo(() => {
    return options
      .map((entry) => entry.trim())
      .filter(Boolean)
  }, [options])

  function buildQuestionTitle(marketTitle: string, option: string): string {
    return `Will ${option} win ${marketTitle}?`
  }

  function buildQuestionDescription(marketTitle: string, option: string): string {
    const baseDescription = form.description.trim()
    if (baseDescription) {
      return `${baseDescription} This market refers specifically to the option "${option}" under "${marketTitle}". It resolves to "Yes" if ${option} is the correct final outcome, otherwise it resolves to "No".`
    }

    return `This market refers specifically to the option "${option}" under "${marketTitle}". It resolves to "Yes" if ${option} is the correct final outcome, otherwise it resolves to "No".`
  }

  const visiblePredictions = useMemo(() => {
    return storedPredictions.filter((item) => {
      if (activeCategory === 'All') return true
      if (activeCategory === 'Created') return item.status === 'created'
      if (activeCategory === 'Open') return item.status === 'open'
      if (activeCategory === 'Resolved') return item.status === 'resolved'
      return true
    })
  }, [activeCategory, storedPredictions])

  async function handleCreatePrediction() {
    if (!wallet.selectedProvider) {
      setCreateError('Please connect a wallet first.')
      return
    }

    if (wallet.chainId !== APP_CHAIN.chainId) {
      setCreateError(`Please switch wallet network to ${APP_CHAIN.name}.`)
      return
    }

    if (!form.title.trim()) {
      setCreateError('Market title is required.')
      return
    }

    if (outcomes.length < 2) {
      setCreateError('At least two outcomes are required, separated by commas.')
      return
    }

    if (optionItems.length < 1) {
      setCreateError('Please provide at least one option, one per line.')
      return
    }

    try {
      setCreateSubmitting(true)
      setCreatePhase('approving')
      setCreateError(null)
      setCreateResults([])

      const browserProvider = new BrowserProvider(wallet.selectedProvider.provider as any)
      const signer = await browserProvider.getSigner()
      const owner = await signer.getAddress()
      await ensureRewardTokenAllowance(signer, owner, [form.reward, form.proposalBond])
      setCreatePhase('submitting')

      const nextResults: Array<CreatePredictionResult & { option: string }> = []

      for (const option of optionItems) {
        const questionTitle = buildQuestionTitle(form.title.trim(), option)
        const questionDescription = buildQuestionDescription(form.title.trim(), option)
        const result = await createPrediction({
          signer,
          title: questionTitle,
          description: questionDescription,
          outcomes,
          rewardToken: form.rewardToken.trim(),
          reward: form.reward,
          proposalBond: form.proposalBond,
        })

        nextResults.push({ ...result, option })
        setStoredPredictions(() =>
          upsertStoredPrediction({
            txHash: result.txHash,
            questionId: result.questionId,
            conditionId: result.conditionId,
            adapterVersion: result.adapterVersion,
            marketTitle: form.title.trim(),
            option,
            title: questionTitle,
            description: questionDescription,
            outcomes,
            rewardToken: form.rewardToken.trim(),
            reward: form.reward,
            proposalBond: form.proposalBond,
            chainId: APP_CHAIN.chainId,
            creator: wallet.account,
            createdAt: new Date().toISOString(),
            status: 'created',
          }),
        )
      }

      setCreateResults(nextResults)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create prediction')
    } finally {
      setCreateSubmitting(false)
      setCreatePhase('idle')
    }
  }

  return (
    <div className="pm-app">
      <header className="site-header">
        <div className="site-header-inner simple-header">
          <div className="brand-lockup">
            <span>Polymarket</span>
          </div>

          <div className="site-actions">
            {wallet.account ? (
              <button className="nav-action" onClick={() => setCreateModalOpen(true)}>
                Create prediction
              </button>
            ) : null}

            {wallet.account ? (
              <div className="wallet-chip" ref={walletPanelRef}>
                <button className="wallet-action wallet-primary" onClick={() => setWalletPanelOpen((open) => !open)}>
                  {shortenAddress(wallet.account)}
                </button>

                {walletPanelOpen ? (
                  <div className="wallet-menu wallet-menu-light">
                    <p>{wallet.selectedProvider?.info.name ?? 'Injected wallet'}</p>
                    <p>Chain: {wallet.chainId ?? '--'}</p>
                    <button onClick={() => void wallet.ensureTargetChain()}>Switch to Base Sepolia</button>
                    <button onClick={wallet.disconnect}>Disconnect</button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="wallet-chip" ref={walletPanelRef}>
                <button
                  className="wallet-action wallet-primary"
                  onClick={() => {
                    wallet.refreshProviders()
                    setWalletPanelOpen((open) => !open)
                  }}
                >
                  Connect Wallet
                </button>

                {walletPanelOpen ? (
                  <div className="wallet-menu wallet-menu-light">
                    {wallet.providers.length === 0 ? <p>No EIP-6963 wallet found.</p> : null}
                    {wallet.providers.map((provider) => (
                      <button
                        className="wallet-option"
                        key={provider.info.uuid}
                        onClick={() => {
                          void wallet.connect(provider)
                          setWalletPanelOpen(false)
                        }}
                      >
                        {provider.info.icon ? (
                          <img className="wallet-option-icon" src={provider.info.icon} alt={provider.info.name} />
                        ) : (
                          <span className="wallet-option-fallback">{provider.info.name.slice(0, 1)}</span>
                        )}
                        <span>{provider.info.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <button className="icon-action">☰</button>
          </div>
        </div>
      </header>

      <main className="markets-page">
        {wallet.account ? (
          <section className="portfolio-strip">
            <article>
              <span>Wallet</span>
              <strong>{shortenAddress(wallet.account)}</strong>
            </article>
            <article>
              <span>Chain</span>
              <strong>{wallet.chainId === APP_CHAIN.chainId ? APP_CHAIN.name : wallet.chainId ?? '--'}</strong>
            </article>
            <article>
              <span>Assets</span>
              <strong>{assets.map((asset) => `${asset.symbol} ${asset.balance}`).join(' · ') || '--'}</strong>
            </article>
          </section>
        ) : null}

        <section className="market-header">
          <div>
            <h1>Predictions</h1>
            <p>{visiblePredictions.length} markets visible</p>
          </div>

          <div className="market-tools">
            <button>⌕</button>
            <button>≡</button>
            <button>⌑</button>
          </div>
        </section>

        <section className="category-strip">
          {CATEGORY_ITEMS.map((item) => (
            <button
              key={item}
              className={activeCategory === item ? 'active' : ''}
              onClick={() => setActiveCategory(item)}
            >
              {item}
            </button>
          ))}
        </section>

        {wallet.error ? (
          <section className="status-banner error-banner">
            <p>{wallet.error}</p>
          </section>
        ) : null}

        {wallet.chainId && wallet.chainId !== APP_CHAIN.chainId ? (
          <section className="status-banner warning-banner">
            <p>Current wallet chain is {wallet.chainId}. This app uses Base Sepolia ({APP_CHAIN.chainId}).</p>
            <button onClick={() => void wallet.ensureTargetChain()}>Switch Network</button>
          </section>
        ) : null}

        <section className="markets-grid">
          {visiblePredictions.length > 0 ? (
            visiblePredictions.map((item) => (
              <button
                key={item.txHash}
                className="prediction-card"
                onClick={() => setSelectedPrediction(item)}
              >
                <div className="prediction-card-head">
                  <div>
                    <span className="prediction-badge">{item.status}</span>
                    <h3>{item.marketTitle}</h3>
                    <p>{item.option}</p>
                  </div>
                </div>

                <div className="prediction-card-body">
                  <p>{item.title}</p>
                  <p>{item.description}</p>
                </div>

                <div className="prediction-meta">
                  <span>{item.outcomes.join(' / ')}</span>
                  <span>{item.createdAt.slice(0, 10)}</span>
                </div>

                <div className="prediction-meta prediction-mono">
                  <span>{item.txHash}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="no-data">No data</div>
          )}
        </section>
      </main>

      {createModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCreateModalOpen(false)
            }
          }}
        >
          <div className="create-modal">
            <div className="modal-head">
              <div>
                <p className="panel-kicker">Base Sepolia</p>
                <h2>Create prediction</h2>
              </div>
              <button className="modal-close" onClick={() => setCreateModalOpen(false)}>
                ×
              </button>
            </div>

            <p className="panel-note">
              Submit a new question through your deployed UMA CTF Adapter and prepare a conditional market.
            </p>

            <section className="prediction-form">
              <label>
                <span>Market title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="2026 NCAA Tournament Winner"
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder='This market resolves to "Yes" if the selected option is the final winner.'
                  rows={3}
                />
              </label>

              <label>
                <span>Options</span>
                <div className="option-list">
                  {options.map((option, index) => (
                    <div key={`option-${index}`} className="option-row">
                      <input
                        value={option}
                        onChange={(event) => {
                          const next = [...options]
                          next[index] = event.target.value
                          setOptions(next)
                        }}
                        placeholder={index === 0 ? 'Duke' : `Option ${index + 1}`}
                      />
                      {options.length > 1 ? (
                        <button
                          type="button"
                          className="option-remove"
                          onClick={() => {
                            setOptions((current) => current.filter((_, currentIndex) => currentIndex !== index))
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="option-add-link"
                    onClick={() => {
                      setOptions((current) => [...current, ''])
                    }}
                  >
                    + Add option
                  </button>
                </div>
              </label>

              <div className="form-grid">
                <label>
                  <span>Outcomes</span>
                  <input value="Yes / No" readOnly />
                </label>

                <label>
                  <span>Reward token</span>
                  <input value={BASE_SEPOLIA_USDC} readOnly />
                </label>

                <label>
                  <span>Reward amount</span>
                  <input
                    value={form.reward}
                    onChange={(event) => setForm((current) => ({ ...current, reward: event.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </label>

                <label>
                  <span>Proposal bond</span>
                  <input
                    value={form.proposalBond}
                    onChange={(event) => setForm((current) => ({ ...current, proposalBond: event.target.value }))}
                    inputMode="decimal"
                    placeholder="750"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="wallet-action wallet-primary" onClick={() => void handleCreatePrediction()} disabled={createSubmitting}>
                  {createSubmitting
                    ? createPhase === 'approving'
                      ? 'Approving...'
                      : 'Submitting...'
                    : 'Create predictions'}
                </button>

                {wallet.chainId !== APP_CHAIN.chainId ? (
                  <button className="wallet-action wallet-secondary" onClick={() => void wallet.ensureTargetChain()}>
                    Switch to Base Sepolia
                  </button>
                ) : null}
              </div>

              {createError ? (
                <section className="status-banner error-banner">
                  <p>{createError}</p>
                </section>
              ) : null}

              {createResults.length > 0 ? (
                <div className="create-result">
                  {createResults.map((result) => (
                    <article key={`${result.option}-${result.questionId}`}>
                      <span>{result.option}</span>
                      <strong>{result.questionId}</strong>
                      <strong>{result.txHash}</strong>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {selectedPrediction ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedPrediction(null)
            }
          }}
        >
          <div className="create-modal detail-modal">
            <div className="modal-head">
              <div>
                <p className="panel-kicker">Prediction Detail</p>
                <h2>{selectedPrediction.marketTitle}</h2>
              </div>
              <button className="modal-close" onClick={() => setSelectedPrediction(null)}>
                ×
              </button>
            </div>

            <div className="detail-grid">
              <article>
                <span>Status</span>
                <strong>{selectedPrediction.status}</strong>
              </article>
              <article>
                <span>Option</span>
                <strong>{selectedPrediction.option}</strong>
              </article>
              <article>
                <span>Outcomes</span>
                <strong>{selectedPrediction.outcomes.join(' / ')}</strong>
              </article>
              <article>
                <span>Created At</span>
                <strong>{selectedPrediction.createdAt}</strong>
              </article>
            </div>

            <div className="detail-section">
              <span>Question Title</span>
              <p>{selectedPrediction.title}</p>
            </div>

            <div className="detail-section">
              <span>Description</span>
              <p>{selectedPrediction.description}</p>
            </div>

            <div className="detail-grid">
              <article>
                <span>Reward Token</span>
                <strong>{selectedPrediction.rewardToken}</strong>
              </article>
              <article>
                <span>Reward</span>
                <strong>{selectedPrediction.reward}</strong>
              </article>
              <article>
                <span>Proposal Bond</span>
                <strong>{selectedPrediction.proposalBond}</strong>
              </article>
              <article>
                <span>Creator</span>
                <strong>{selectedPrediction.creator ?? '--'}</strong>
              </article>
            </div>

            <div className="detail-grid">
              <article>
                <span>Question ID</span>
                <strong>{selectedPrediction.questionId}</strong>
              </article>
              <article>
                <span>Condition ID</span>
                <strong>{selectedPrediction.conditionId}</strong>
              </article>
              <article className="detail-wide">
                <span>Tx Hash</span>
                <strong>{selectedPrediction.txHash}</strong>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
