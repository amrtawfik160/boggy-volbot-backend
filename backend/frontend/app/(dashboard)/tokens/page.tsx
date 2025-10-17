'use client'

import { useState, useEffect } from 'react'
import { tokenApi, type Token } from '@/lib/api/tokens'

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddToken, setShowAddToken] = useState(false)
  const [tokenMint, setTokenMint] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDecimals, setTokenDecimals] = useState('9')
  const [submitting, setSubmitting] = useState(false)
  const [fetchingMetadata, setFetchingMetadata] = useState(false)

  useEffect(() => {
    loadTokens()
  }, [])

  const loadTokens = async () => {
    try {
      setLoading(true)
      const data = await tokenApi.list()
      setTokens(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchMetadata = async () => {
    if (!tokenMint) return

    try {
      setFetchingMetadata(true)
      const metadata = await tokenApi.fetchMetadata(tokenMint)
      setTokenSymbol(metadata.symbol)
      setTokenDecimals(metadata.decimals.toString())
    } catch (err: any) {
      alert(err.message || 'Failed to fetch token metadata. Please enter manually.')
    } finally {
      setFetchingMetadata(false)
    }
  }

  const handleAddToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const newToken = await tokenApi.create({
        mint: tokenMint,
        symbol: tokenSymbol,
        decimals: parseInt(tokenDecimals),
      })

      setTokens([...tokens, newToken])
      setShowAddToken(false)
      setTokenMint('')
      setTokenSymbol('')
      setTokenDecimals('9')
    } catch (err: any) {
      alert(err.message || 'Failed to add token')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteToken = async (id: string) => {
    if (!confirm('Are you sure you want to delete this token?')) return

    try {
      await tokenApi.delete(id)
      setTokens(tokens.filter(t => t.id !== id))
    } catch (err: any) {
      alert(err.message || 'Failed to delete token')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading tokens...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tokens</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage SPL tokens for your campaigns
          </p>
        </div>
        <button
          onClick={() => setShowAddToken(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500"
        >
          Add Token
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showAddToken && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Add New Token
            </h3>
            <form onSubmit={handleAddToken} className="space-y-4">
              <div>
                <label htmlFor="mint" className="block text-sm font-medium text-gray-700">
                  Token Mint Address
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    id="mint"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    className="block w-full border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm font-mono"
                    placeholder="Enter SPL token mint address"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleFetchMetadata}
                    disabled={!tokenMint || fetchingMetadata}
                    className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {fetchingMetadata ? 'Fetching...' : 'Auto-fill'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="symbol" className="block text-sm font-medium text-gray-700">
                    Token Symbol
                  </label>
                  <input
                    type="text"
                    id="symbol"
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    placeholder="e.g., USDC, BONK"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="decimals" className="block text-sm font-medium text-gray-700">
                    Decimals
                  </label>
                  <input
                    type="number"
                    id="decimals"
                    value={tokenDecimals}
                    onChange={(e) => setTokenDecimals(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    min="0"
                    max="18"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddToken(false)}
                  className="bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? 'Adding...' : 'Add Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          {tokens.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No tokens yet. Add your first token to create campaigns.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mint Address
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Decimals
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tokens.map((token) => (
                    <tr key={token.id}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {token.symbol}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {token.decimals}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteToken(token.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
