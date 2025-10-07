'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { tokenApi, type Token, type Pool } from '@/lib/api/tokens'
import { walletApi, type Wallet } from '@/lib/api/wallets'
import { campaignApi } from '@/lib/api/campaigns'

type Step = 'token' | 'wallets' | 'parameters' | 'review'

export default function NewCampaignPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('token')
  const [loading, setLoading] = useState(true)

  // Data
  const [tokens, setTokens] = useState<Token[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [pools, setPools] = useState<Pool[]>([])

  // Form state
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [selectedPool, setSelectedPool] = useState<string>('')
  const [selectedWallets, setSelectedWallets] = useState<string[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [minTxSize, setMinTxSize] = useState('0.01')
  const [maxTxSize, setMaxTxSize] = useState('0.1')
  const [useJito, setUseJito] = useState(false)
  const [jitoTip, setJitoTip] = useState('0.0001')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedToken) {
      loadPools(selectedToken)
    }
  }, [selectedToken])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tokensData, walletsData] = await Promise.all([
        tokenApi.list(),
        walletApi.list(),
      ])
      setTokens(tokensData)
      setWallets(walletsData.filter(w => w.is_active))
    } catch (err: any) {
      alert(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadPools = async (tokenId: string) => {
    try {
      const poolsData = await tokenApi.discoverPools(tokenId)
      setPools(poolsData)
      if (poolsData.length > 0) {
        setSelectedPool(poolsData[0].id)
      }
    } catch (err: any) {
      console.error('Failed to load pools:', err)
      setPools([])
    }
  }

  const handleSubmit = async () => {
    if (!campaignName || !selectedToken || !selectedPool) {
      alert('Please complete all required fields')
      return
    }

    setSubmitting(true)
    try {
      const campaign = await campaignApi.create({
        name: campaignName,
        token_id: selectedToken,
        pool_id: selectedPool,
        params: {
          slippage: parseFloat(slippage),
          minTxSize: parseFloat(minTxSize),
          maxTxSize: parseFloat(maxTxSize),
          useJito,
          jitoTip: useJito ? parseFloat(jitoTip) : undefined,
          walletIds: selectedWallets,
        },
      })

      router.push(`/campaigns/${campaign.id}`)
    } catch (err: any) {
      alert(err.message || 'Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleWallet = (walletId: string) => {
    if (selectedWallets.includes(walletId)) {
      setSelectedWallets(selectedWallets.filter(id => id !== walletId))
    } else {
      setSelectedWallets([...selectedWallets, walletId])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a new volume generation campaign
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {(['token', 'wallets', 'parameters', 'review'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-8 h-8 ${
                step === s
                  ? 'bg-indigo-600 text-white'
                  : i < ['token', 'wallets', 'parameters', 'review'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {i + 1}
            </div>
            <span className={`ml-2 text-sm ${step === s ? 'font-medium' : ''}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 3 && <div className="flex-1 h-0.5 bg-gray-200 mx-4" />}
          </div>
        ))}
      </div>

      <div className="bg-white shadow border border-gray-200 p-6">
        {/* Step 1: Select Token */}
        {step === 'token' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Select Token</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Token</label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              >
                <option value="">Select a token</option>
                {tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.symbol} ({token.mint.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            {selectedToken && pools.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Pool</label>
                <select
                  value={selectedPool}
                  onChange={(e) => setSelectedPool(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                >
                  {pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.dex} - {pool.pool_address.slice(0, 8)}...
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedToken && pools.length === 0 && (
              <div className="text-sm text-amber-600">
                No pools found for this token. You may need to add a pool first.
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => router.push('/campaigns')}
                className="px-4 py-2 text-sm font-semibold bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('wallets')}
                disabled={!selectedToken || !selectedPool}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Wallets */}
        {step === 'wallets' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Select Wallets</h2>
            
            {wallets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">No wallets available. Add a wallet first.</p>
                <button
                  onClick={() => router.push('/wallets')}
                  className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-500"
                >
                  Add Wallet
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((wallet) => (
                  <label key={wallet.id} className="flex items-center gap-3 p-3 border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedWallets.includes(wallet.id)}
                      onChange={() => toggleWallet(wallet.id)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{wallet.label || 'Unnamed Wallet'}</div>
                      <div className="text-sm text-gray-500 font-mono">
                        {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('token')}
                className="px-4 py-2 text-sm font-semibold bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep('parameters')}
                disabled={selectedWallets.length === 0}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Parameters */}
        {step === 'parameters' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Campaign Parameters</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                placeholder="My Campaign"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Slippage (%)</label>
                <input
                  type="number"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  step="0.1"
                  min="0.1"
                  max="50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Min Transaction (SOL)</label>
                <input
                  type="number"
                  value={minTxSize}
                  onChange={(e) => setMinTxSize(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  step="0.01"
                  min="0.001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Max Transaction (SOL)</label>
                <input
                  type="number"
                  value={maxTxSize}
                  onChange={(e) => setMaxTxSize(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  step="0.01"
                  min="0.001"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="useJito"
                checked={useJito}
                onChange={(e) => setUseJito(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="useJito" className="text-sm font-medium text-gray-700">
                Use Jito (Priority Execution)
              </label>
            </div>

            {useJito && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Jito Tip (SOL)</label>
                <input
                  type="number"
                  value={jitoTip}
                  onChange={(e) => setJitoTip(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  step="0.0001"
                  min="0.0001"
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('wallets')}
                className="px-4 py-2 text-sm font-semibold bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={!campaignName}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Review
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Review Campaign</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Campaign Name:</span>
                <span className="font-medium">{campaignName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Token:</span>
                <span className="font-medium">
                  {tokens.find(t => t.id === selectedToken)?.symbol || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Wallets:</span>
                <span className="font-medium">{selectedWallets.length} selected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Slippage:</span>
                <span className="font-medium">{slippage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Transaction Size:</span>
                <span className="font-medium">{minTxSize} - {maxTxSize} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Jito:</span>
                <span className="font-medium">{useJito ? `Yes (${jitoTip} SOL tip)` : 'No'}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setStep('parameters')}
                className="px-4 py-2 text-sm font-semibold bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

