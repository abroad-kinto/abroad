import { useTranslate } from '@tolgee/react'
import {
  useCallback, useMemo,
} from 'react'

import type { NavBarResponsiveProps } from '../../features/swap/components/NavBarResponsive'

import { useWebSocketSubscription } from '../../contexts/WebSocketContext'
import { useChainBalance } from './useChainBalance'
import { useWalletAuth } from './useWalletAuth'

const DEFAULT_INFO_URL = 'https://linktr.ee/Abroad.finance'

const normalizeWalletKind = (id?: null | string) => {
  if (!id) return 'unknown'
  const v = id.toLowerCase()
  if (v.includes('wallet-connect')) return 'walletconnect'
  if (v.includes('freighter')) return 'freighter'
  if (v.includes('hana')) return 'hana'
  if (v.includes('lobstr')) return 'lobstr'
  if (v.includes('xbull')) return 'xbull'
  if (v.includes('rabet')) return 'rabet'
  if (v.includes('stellar') || v.includes('trust')) return 'stellar'
  return 'unknown'
}

interface UseNavBarResponsiveArgs {
  infoUrl?: string
  onWalletConnect?: () => void
  onWalletDetails?: () => void
}

type UseNavBarResponsiveResult = Pick<NavBarResponsiveProps,
  'address' | 'balance' | 'balanceLoading' | 'infoUrl' | 'labels' | 'onWalletClick' | 'walletInfo'
>

export function useNavBarResponsive({
  infoUrl = DEFAULT_INFO_URL,
  onWalletConnect,
  onWalletDetails,
}: UseNavBarResponsiveArgs = {}): UseNavBarResponsiveResult {
  const { wallet } = useWalletAuth()
  const { t } = useTranslate()
  const { loading: balanceLoading, refetch, totalBalance: balance } = useChainBalance(
    wallet?.chainId ?? null,
    wallet?.address ?? null,
  )

  const refreshBalance = useCallback(() => {
    void refetch()
  }, [refetch])

  useWebSocketSubscription('transaction.created', refreshBalance)
  useWebSocketSubscription('transaction.updated', refreshBalance)

  const handleDirectWalletConnect = useCallback(async () => {
    if (onWalletConnect) return onWalletConnect()
    try {
      if (!wallet) return
      if (wallet.walletId === 'wallet-connect') {
        const fallbackChainId = wallet.chainId || import.meta.env.VITE_STELLAR_CHAIN_ID || 'stellar:pubnet'
        await wallet.connect({ chainId: fallbackChainId })
        return
      }
      await wallet.connect()
    }
    catch { /* noop */ }
  }, [onWalletConnect, wallet])

  const onWalletClick = useCallback(() => {
    if (wallet?.address) onWalletDetails?.()
    else handleDirectWalletConnect()
  }, [
    wallet?.address,
    onWalletDetails,
    handleDirectWalletConnect,
  ])

  const walletInfo = useMemo(() => {
    const kind = normalizeWalletKind(wallet?.walletId)
    const map: Record<string, { icon?: string
      name: string }> = {
      freighter: { name: 'Freighter' },
      hana: { name: 'Hana' },
      lobstr: { name: 'Lobstr' },
      rabet: { name: 'Rabet' },
      stellar: { name: 'Stellar Wallet' },
      unknown: { name: 'Wallet' },
      walletconnect: { name: 'WalletConnect' },
      xbull: { name: 'xBull' },
    }
    return map[kind] || map.unknown
  }, [wallet?.walletId])

  const labels = useMemo(() => ({
    connectWallet: t('navbar.connect_wallet', 'Conectar Billetera'),
    connectWalletAria: t('navbar.connect_wallet_aria', 'Conectar billetera'),
    infoAriaLabel: t('navbar.info_aria_label', 'Información de Abroad'),
    notConnected: t('navbar.not_connected', 'No conectado'),
    walletDetailsAria: t('navbar.wallet_details_aria', 'Ver detalles de la billetera'),
  }), [t])

  return {
    address: wallet?.address || null,
    balance,
    balanceLoading,
    infoUrl,
    labels,
    onWalletClick,
    walletInfo,
  }
}
