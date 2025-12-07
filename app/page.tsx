"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_FAUCET_API_URL!;
const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || "SLR";
const INTERVAL_HOURS =
  Number(process.env.NEXT_PUBLIC_CLAIM_INTERVAL_HOURS || 12);

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setTxHash(null);

    if (!address) {
      setError("Please enter a wallet address.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error ||
            `Unable to send tokens. Try again after ${INTERVAL_HOURS} hours.`
        );
      } else {
        setMessage(`Successfully sent 5 ${TOKEN_SYMBOL}!`);
        if (data.txHash) {
          setTxHash(data.txHash);
        }
      }
    } catch (err) {
      setError("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-1">
          SLR Faucet
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Get 5 {TOKEN_SYMBOL} every {INTERVAL_HOURS} hours on{" "}
          {process.env.NEXT_PUBLIC_CHAIN_NAME || "Arbitrun sepolia testnet"}.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Wallet address
            </label>
            <input
              id="address"
              type="text"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700/60 disabled:cursor-not-allowed text-sm font-medium py-2.5 transition-colors"
          >
            {loading ? "Sending..." : `Get ${TOKEN_SYMBOL}`}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300">
            {message}
            {txHash && (
              <div className="mt-1 break-all text-xs text-emerald-200/80">
                Tx: {txHash}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
          Each address can claim 5 {TOKEN_SYMBOL} every {INTERVAL_HOURS} hours.
          Make sure your you dont waste the tokens! Faucet is rate-limited to
          prevent abuse.
        </p>
      </div>
    </main>
  );
}
