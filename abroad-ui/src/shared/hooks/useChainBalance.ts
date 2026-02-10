import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Horizon } from '@stellar/stellar-sdk'
import { ethers } from 'ethers'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Token config per chain ──────────────────────────────────────────────
// To add a new chain: add an entry here keyed by its CAIP-2 chainId.
// Stellar is handled separately via Horizon and does not need an entry.

interface TokenInfo {
  address: string
  decimals: number
}

interface ChainConfig {
  explorer: string
  rpcUrl: string
  tokens: Record<string, TokenInfo>
}

const CHAIN_CONFIG: Record<string, ChainConfig> = {
  'eip155:42220': {
    explorer: 'https://celoscan.io/address/',
    rpcUrl: 'https://forno.celo.org',
    tokens: {
      USDC: { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
      USDT: { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },
    },
  },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
    explorer: 'https://explorer.solana.com/address/',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    tokens: {
      USDC: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
      USDT: { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
    },
  },
}

const STELLAR_HORIZON_URL = 'https://horizon.stellar.org'
const STELLAR_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const ERC20_BALANCE_ABI = ['function balanceOf(address owner) view returns (uint256)']

// ── Token balance type ──────────────────────────────────────────────────

export interface TokenBalance {
  balance: string
  symbol: string
}

export interface ChainBalanceResult {
  balances: TokenBalance[]
  explorerUrl: string | null
  loading: boolean
  refetch: () => void
  totalBalance: string
}

// ── Fetchers per chain family ───────────────────────────────────────────

function formatBalance(value: number): string {
  if (!Number.isFinite(value)) return '0.00'
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

async function fetchStellarBalances(address: string): Promise<TokenBalance[]> {
  try {
    const server = new Horizon.Server(STELLAR_HORIZON_URL)
    const account = await server.loadAccount(address)
    const results: TokenBalance[] = []

    for (const bal of account.balances) {
      if (
        bal.asset_type !== 'native'
        && 'asset_code' in bal
        && 'asset_issuer' in bal
        && bal.asset_issuer === STELLAR_USDC_ISSUER
        && 'balance' in bal
      ) {
        const value = parseFloat(bal.balance)
        results.push({ balance: formatBalance(value), symbol: bal.asset_code })
      }
    }

    return results.length > 0 ? results : [{ balance: '0.00', symbol: 'USDC' }]
  }
  catch {
    return [{ balance: '0.00', symbol: 'USDC' }]
  }
}

async function fetchEVMBalances(address: string, config: ChainConfig): Promise<TokenBalance[]> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl)
  const results: TokenBalance[] = []

  for (const [symbol, token] of Object.entries(config.tokens)) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_BALANCE_ABI, provider)
      const raw = await contract.balanceOf(address)
      const formatted = ethers.formatUnits(raw, token.decimals)
      results.push({ balance: formatBalance(parseFloat(formatted)), symbol })
    }
    catch {
      results.push({ balance: '0.00', symbol })
    }
  }

  return results
}

async function fetchSolanaBalances(address: string, config: ChainConfig): Promise<TokenBalance[]> {
  const connection = new Connection(config.rpcUrl, 'confirmed')
  const owner = new PublicKey(address)
  const results: TokenBalance[] = []

  for (const [symbol, token] of Object.entries(config.tokens)) {
    try {
      const mint = new PublicKey(token.address)
      const accounts = await connection.getTokenAccountsByOwner(owner, {
        mint,
        programId: TOKEN_PROGRAM_ID,
      })

      if (accounts.value.length > 0) {
        const info = await connection.getTokenAccountBalance(accounts.value[0].pubkey)
        const value = parseFloat(info.value.uiAmountString || '0')
        results.push({ balance: formatBalance(value), symbol })
      }
      else {
        results.push({ balance: '0.00', symbol })
      }
    }
    catch {
      results.push({ balance: '0.00', symbol })
    }
  }

  return results
}

// ── Resolve chain family from chainId ───────────────────────────────────

function resolveChainFamily(chainId: string): 'evm' | 'solana' | 'stellar' | null {
  if (chainId.startsWith('stellar:')) return 'stellar'
  if (chainId.startsWith('eip155:')) return 'evm'
  if (chainId.startsWith('solana:')) return 'solana'
  return null
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useChainBalance(
  chainId: string | null,
  address: string | null,
): ChainBalanceResult {
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(0)

  const refetch = useCallback(async () => {
    if (!chainId || !address) {
      setBalances([])
      return
    }

    const family = resolveChainFamily(chainId)
    if (!family) {
      setBalances([])
      return
    }

    const token = ++inFlight.current
    setLoading(true)

    try {
      let result: TokenBalance[]

      if (family === 'stellar') {
        result = await fetchStellarBalances(address)
      }
      else {
        const config = CHAIN_CONFIG[chainId]
        if (!config) {
          result = []
        }
        else if (family === 'evm') {
          result = await fetchEVMBalances(address, config)
        }
        else {
          result = await fetchSolanaBalances(address, config)
        }
      }

      if (token === inFlight.current) setBalances(result)
    }
    catch {
      if (token === inFlight.current) setBalances([])
    }
    finally {
      if (token === inFlight.current) setLoading(false)
    }
  }, [chainId, address])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalBalance = balances.reduce((sum, b) => {
    const n = parseFloat(b.balance.replace(/,/g, ''))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  const config = chainId ? CHAIN_CONFIG[chainId] : null
  const explorerUrl = config && address ? `${config.explorer}${address}` : null

  return {
    balances,
    explorerUrl,
    loading,
    refetch,
    totalBalance: formatBalance(totalBalance),
  }
}

export function getExplorerUrl(chainId: string | null, address: string | null): string | null {
  if (!chainId || !address) return null
  if (chainId.startsWith('stellar:')) return `https://stellar.expert/explorer/public/account/${address}`
  const config = CHAIN_CONFIG[chainId]
  return config ? `${config.explorer}${address}` : null
}
