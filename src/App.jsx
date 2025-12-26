import { useEffect, useMemo, useState } from 'react'
import confetti from 'canvas-confetti'

import { StonApiClient, AssetTag } from '@ston-fi/api'
import { dexFactory, Client } from '@ston-fi/sdk'

import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'

const DEFAULT_RPC = 'https://toncenter.com/api/v2/jsonRPC'

// ✅ Put your LBH Jetton master address in .env as:
//    VITE_LBH_JETTON_MASTER=EQ....
// Optional RPC override:
//    VITE_TON_RPC=https://toncenter.com/api/v2/jsonRPC
const LBH_JETTON_MASTER = import.meta.env.VITE_LBH_JETTON_MASTER || ''
const TON_RPC = import.meta.env.VITE_TON_RPC || DEFAULT_RPC

function shortAddr(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function pickDefaultAssets(assets) {
  const ton = assets.find(a => (a.meta?.symbol || '').toUpperCase() === 'TON' || a.kind === 'Ton') || null

  // Try match by exact contract address if user provided one
  const lbh =
    (LBH_JETTON_MASTER
      ? assets.find(a => a.contractAddress === LBH_JETTON_MASTER)
      : null) ||
    assets.find(a => (a.meta?.symbol || '').toUpperCase() === 'LBH') ||
    null

  return { ton, lbh }
}

export default function App() {
  const [assets, setAssets] = useState([])
  const [fromAsset, setFromAsset] = useState(null)
  const [toAsset, setToAsset] = useState(null)
  const [amount, setAmount] = useState('')
  const [simulationResult, setSimulationResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const [tonConnectUI] = useTonConnectUI()
  const userAddress = useTonAddress()

  const api = useMemo(() => new StonApiClient(), [])

  const getAssetInfo = (asset) => {
    if (!asset) return { symbol: 'token', decimals: 10 ** 9 }
    const symbol = asset.meta?.symbol || asset.meta?.displayName || 'token'
    const decimals = 10 ** (asset.meta?.decimals ?? 9)
    return { symbol, decimals }
  }

  const displaySymbol = (asset) => getAssetInfo(asset).symbol

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setStatus('Loading token list…')
        const condition = [
          AssetTag.LiquidityVeryHigh,
          AssetTag.LiquidityHigh,
          AssetTag.LiquidityMedium
        ].join(' | ')
        const list = await api.queryAssets({ condition })
        if (cancelled) return

        setAssets(list)

        const { ton, lbh } = pickDefaultAssets(list)

        // Default: TON -> LBH if we can find LBH
        setFromAsset(ton || list[0] || null)
        setToAsset(lbh || list[1] || null)
        setStatus('')
      } catch (e) {
        console.error(e)
        setStatus('Could not load token list. Check console.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api])

  const onChangeAsset = (setter) => (e) => {
    const addr = e.target.value
    const selected = assets.find(a => a.contractAddress === addr)
    setter(selected || null)
    setSimulationResult(null)
  }

  const onFlip = () => {
    const a = fromAsset
    setFromAsset(toAsset)
    setToAsset(a)
    setSimulationResult(null)
  }

  const handleSimulate = async () => {
    if (!fromAsset || !toAsset) return
    if (!amount || Number(amount) <= 0) return

    setBusy(true)
    setStatus('Simulating…')
    setSimulationResult(null)

    try {
      const { decimals: fromDecimals } = getAssetInfo(fromAsset)
      const offerUnits = (Number(amount) * fromDecimals).toString()

      const result = await api.simulateSwap({
        offerAddress: fromAsset.contractAddress,
        askAddress: toAsset.contractAddress,
        slippageTolerance: '0.01',
        offerUnits
      })

      setSimulationResult(result)
      setStatus('Ready.')
    } catch (e) {
      console.error(e)
      setStatus('Simulation failed. Try a smaller amount or different pair.')
    } finally {
      setBusy(false)
    }
  }

  const handleSwap = async () => {
    if (!userAddress) {
      alert('Connect your wallet first.')
      return
    }
    if (!fromAsset || !toAsset || !amount || Number(amount) <= 0) return
    if (!simulationResult) {
      alert('Simulate first (so we lock the route + min received).')
      return
    }

    setBusy(true)
    setStatus('Building transaction…')

    try {
      // 1) Init TON JSON-RPC client
      const tonApiClient = new Client({ endpoint: TON_RPC })

      // 2) Use router info from simulation
      const routerInfo = simulationResult.router
      const dexContracts = dexFactory(routerInfo)

      const router = tonApiClient.open(dexContracts.Router.create(routerInfo.address))
      const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress)

      // 3) Shared params
      const sharedTxParams = {
        userWalletAddress: userAddress,
        offerAmount: simulationResult.offerUnits,
        minAskAmount: simulationResult.minAskUnits
      }

      // 4) Choose swap type
      const getSwapParams = () => {
        // TON -> Jetton
        if (fromAsset.kind === 'Ton') {
          return router.getSwapTonToJettonTxParams({
            ...sharedTxParams,
            proxyTon,
            askJettonAddress: simulationResult.askAddress
          })
        }

        // Jetton -> TON
        if (toAsset.kind === 'Ton') {
          return router.getSwapJettonToTonTxParams({
            ...sharedTxParams,
            proxyTon,
            offerJettonAddress: simulationResult.offerAddress
          })
        }

        // Jetton -> Jetton
        return router.getSwapJettonToJettonTxParams({
          ...sharedTxParams,
          offerJettonAddress: simulationResult.offerAddress,
          askJettonAddress: simulationResult.askAddress
        })
      }

      const swapParams = await getSwapParams()

      setStatus('Sending to wallet for approval…')

      await tonConnectUI.sendTransaction({
        validUntil: Date.now() + 5 * 60 * 1000,
        messages: [
          {
            address: swapParams.to.toString(),
            amount: swapParams.value.toString(),
            payload: swapParams.body?.toBoc().toString('base64')
          }
        ]
      })

      setStatus('Swap request sent ✅ Check your wallet.')
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } })
    } catch (e) {
      console.error(e)
      setStatus('Swap failed. Check console.')
      alert('Swap failed. Open console for the error details.')
    } finally {
      setBusy(false)
    }
  }

  const formattedOutputAmount = simulationResult
    ? (Number(simulationResult.minAskUnits) / getAssetInfo(toAsset).decimals).toFixed(6)
    : ''

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-lg shadow-yellow-500/20" />
            <div>
              <div className="text-sm uppercase tracking-widest text-white/60">Labour By Hire</div>
              <h1 className="text-2xl font-semibold">TON ⇄ LBH Swap</h1>
            </div>
          </div>
          <TonConnectButton />
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Wallet</div>
            <div className="text-sm font-medium">
              {userAddress ? shortAddr(userAddress) : 'Not connected'}
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="text-xs text-white/60">From</label>
              <select
                className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                value={fromAsset?.contractAddress || ''}
                onChange={onChangeAsset(setFromAsset)}
                disabled={busy || assets.length === 0}
              >
                {assets.map((a) => (
                  <option key={a.contractAddress} value={a.contractAddress}>
                    {(a.meta?.symbol || a.meta?.displayName || 'token').toString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center">
              <button
                onClick={onFlip}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide ring-1 ring-white/10 hover:bg-white/15 active:scale-[0.98] transition"
                disabled={busy}
                title="Flip pair"
              >
                FLIP
              </button>
            </div>

            <div>
              <label className="text-xs text-white/60">To</label>
              <select
                className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                value={toAsset?.contractAddress || ''}
                onChange={onChangeAsset(setToAsset)}
                disabled={busy || assets.length === 0}
              >
                {assets.map((a) => (
                  <option key={a.contractAddress} value={a.contractAddress}>
                    {(a.meta?.symbol || a.meta?.displayName || 'token').toString()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/60">Amount</label>
              <div className="mt-1 relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setSimulationResult(null)
                  }}
                  className="w-full rounded-xl bg-black/30 px-4 py-3 pr-20 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                  disabled={busy}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60">
                  {displaySymbol(fromAsset)}
                </div>
              </div>
            </div>

            {simulationResult && (
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Min received (1% slippage)</div>
                <div className="mt-1 text-lg font-semibold">
                  {formattedOutputAmount} {displaySymbol(toAsset)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleSimulate}
                disabled={busy || !fromAsset || !toAsset || !amount}
                className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-40 transition"
              >
                {busy ? 'Working…' : 'Simulate'}
              </button>

              <button
                onClick={handleSwap}
                disabled={busy || !userAddress || !simulationResult}
                className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-40 transition shadow-lg shadow-yellow-500/20"
              >
                Swap
              </button>
            </div>

            <div className="text-xs text-white/60">
              {status || ' '}
              {LBH_JETTON_MASTER ? (
                <span className="ml-2">
                  LBH preset: <span className="font-mono">{shortAddr(LBH_JETTON_MASTER)}</span>
                </span>
              ) : (
                <span className="ml-2">
                  Set <span className="font-mono">VITE_LBH_JETTON_MASTER</span> to preload LBH.
                </span>
              )}
            </div>

            <div className="text-[11px] text-white/40 leading-relaxed">
              Gas note: swaps require a bit of TON for fees. Always verify the route + min received in your wallet
              before approving.
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-white/40">
          Powered by STON.fi · Wallet via TON Connect
        </div>
      </div>
    </div>
  )
}
