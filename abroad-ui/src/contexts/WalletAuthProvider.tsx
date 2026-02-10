import React, { useCallback, useMemo, useState } from 'react'

import type { IWallet } from '../interfaces/IWallet'
import type { WalletType } from '../interfaces/IWalletFactory'

import { useWalletAuthentication } from '../services/useWalletAuthentication'
import { useWalletFactory } from '../services/useWalletFactory'
import { getWalletTypeByDevice } from '../shared/utils'
import { WalletAuthContext } from './WalletAuthContext'

const WALLET_TYPE_KEY = 'abroad:walletType'

function resolveInitialWalletType(): WalletType {
  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('token')) return 'sep24'
  const persisted = localStorage.getItem(WALLET_TYPE_KEY) as WalletType | null
  return persisted || getWalletTypeByDevice()
}

export const WalletAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [kycUrl, _setKycUrl] = useState<null | string>(() => localStorage.getItem('kycUrl'))
  const [walletType, setWalletType] = useState<WalletType>(resolveInitialWalletType)
  const walletAuthentication = useWalletAuthentication()
  const walletFactory = useWalletFactory({ walletAuth: walletAuthentication })

  // Derive wallet from walletType — always reflects the latest handler state.
  // When the WC handler updates its chainId/address, walletFactory changes,
  // getWalletHandler returns the new useMemo'd handler, and consumers see it.
  const wallet = walletFactory.getWalletHandler(walletType)

  // defaultWallet: the device's preferred handler (used by useWebSwapController
  // to pick the right wallet for stellar corridors)
  const defaultWallet = walletFactory.getWalletHandler(
    walletType === 'sep24' ? 'sep24' : getWalletTypeByDevice(),
  )

  const setActiveWallet = useCallback((w: IWallet) => {
    const nextType: WalletType = w.walletId === 'wallet-connect'
      ? 'wallet-connect'
      : w.walletId === 'sep24'
        ? 'sep24'
        : 'stellar-kit'
    setWalletType(nextType)
    // Persist so it survives page refresh
    if (nextType !== 'sep24') {
      localStorage.setItem(WALLET_TYPE_KEY, nextType)
    }
  }, [])

  const setKycUrl = useCallback((url: null | string) => {
    _setKycUrl(url)
    if (url) {
      localStorage.setItem('kycUrl', url)
    }
    else {
      localStorage.removeItem('kycUrl')
    }
  }, [])

  // Memoize context value to prevent unnecessary consumer re-renders
  const contextValue = useMemo(() => ({
    defaultWallet,
    getWalletHandler: walletFactory.getWalletHandler,
    kycUrl,
    setActiveWallet,
    setKycUrl,
    wallet,
    walletAuthentication,
  }), [
    defaultWallet,
    walletFactory.getWalletHandler,
    kycUrl,
    setActiveWallet,
    setKycUrl,
    wallet,
    walletAuthentication,
  ])

  return (
    <WalletAuthContext.Provider value={contextValue}>
      {children}
    </WalletAuthContext.Provider>
  )
}
