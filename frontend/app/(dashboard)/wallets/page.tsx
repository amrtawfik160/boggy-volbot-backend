'use client'

import { useState, useEffect } from 'react'
import { walletApi, type Wallet } from '@/lib/api/wallets'

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddWallet, setShowAddWallet] = useState(false)
  const [walletInput, setWalletInput] = useState('')
  const [walletLabel, setWalletLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadWallets()
  }, [])

  const loadWallets = async () => {
    try {
      setLoading(true)
      const data = await walletApi.list()
      setWallets(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load wallets')
    } finally {
      setLoading(false)
    }
  }

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Determine if input is a private key (longer, typically 88 chars base58) or address
      const isPrivateKey = walletInput.length > 50
      
      const newWallet = await walletApi.create({
        [isPrivateKey ? 'privateKey' : 'address']: walletInput,
        label: walletLabel,
      })

      setWallets([...wallets, newWallet])
      setShowAddWallet(false)
      setWalletInput('')
      setWalletLabel('')
    } catch (err: any) {
      alert(err.message || 'Failed to add wallet')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWallet = async (id: string) => {
    if (!confirm('Are you sure you want to delete this wallet?')) return

    try {
      await walletApi.delete(id)
      setWallets(wallets.filter(w => w.id !== id))
    } catch (err: any) {
      alert(err.message || 'Failed to delete wallet')
    }
  }

  const handleToggleActive = async (wallet: Wallet) => {
    try {
      const updated = await walletApi.update(wallet.id, { is_active: !wallet.is_active })
      setWallets(wallets.map(w => w.id === wallet.id ? updated : w))
    } catch (err: any) {
      alert(err.message || 'Failed to update wallet')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading wallets...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallets</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your Solana wallets for volume generation
          </p>
        </div>
        <button
          onClick={() => setShowAddWallet(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500"
        >
          Add Wallet
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showAddWallet && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Add New Wallet
            </h3>
            <form onSubmit={handleAddWallet} className="space-y-4">
              <div>
                <label htmlFor="label" className="block text-sm font-medium text-gray-700">
                  Wallet Label
                </label>
                <input
                  type="text"
                  id="label"
                  value={walletLabel}
                  onChange={(e) => setWalletLabel(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  placeholder="My Trading Wallet"
                  required
                />
              </div>
              <div>
                <label htmlFor="input" className="block text-sm font-medium text-gray-700">
                  Wallet Address or Private Key
                </label>
                <input
                  type="text"
                  id="input"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm font-mono"
                  placeholder="Enter wallet address or private key"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter a Solana address for read-only, or a private key (base58) for full control
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddWallet(false)}
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
                  {submitting ? 'Adding...' : 'Add Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          {wallets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No wallets yet. Add your first wallet to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Label
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {wallets.map((wallet) => (
                    <tr key={wallet.id}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {wallet.label || 'Unnamed Wallet'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleToggleActive(wallet)}
                          className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                            wallet.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {wallet.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        Custodial
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteWallet(wallet.id)}
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
