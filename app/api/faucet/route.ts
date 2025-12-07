import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RPC_URL = process.env.ARB_SEPOLIA_RPC_URL!;
const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY!;
const TOKEN_ADDRESS = process.env.SLR_TOKEN_ADDRESS!;
const DECIMALS = Number(process.env.SLR_DECIMALS || 18);
const CLAIM_INTERVAL_HOURS = Number(process.env.CLAIM_INTERVAL_HOURS || 12);
const CLAIM_INTERVAL_MS = CLAIM_INTERVAL_HOURS * 60 * 60 * 1000;

// Minimal ERC20 ABI
const erc20Abi = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

if (!RPC_URL || !PRIVATE_KEY || !TOKEN_ADDRESS) {
  console.error("Missing required faucet env vars");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const token = new ethers.Contract(TOKEN_ADDRESS, erc20Abi, wallet);

// In-memory rate limit: address -> lastClaimMs
// Note: resets when the server restarts (fine for a testnet faucet)
const lastClaim = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = body?.address as string | undefined;

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const normalized = address.toLowerCase();
    const now = Date.now();
    const last = lastClaim.get(normalized) ?? 0;

    if (now - last < CLAIM_INTERVAL_MS) {
      const remainingMs = CLAIM_INTERVAL_MS - (now - last);
      const remainingHours = (remainingMs / (60 * 60 * 1000)).toFixed(2);
      return NextResponse.json(
        {
          error: `Already claimed. Try again in ~${remainingHours} hours.`,
        },
        { status: 429 }
      );
    }

    const faucetBalance = await token.balanceOf(wallet.address);
    const amount = ethers.parseUnits("5", DECIMALS);

    if (faucetBalance < amount) {
      return NextResponse.json(
        { error: "Faucet is empty" },
        { status: 500 }
      );
    }

    const tx = await token.transfer(address, amount);
    lastClaim.set(normalized, now);

    return NextResponse.json({
      txHash: tx.hash,
      amount: "5",
      symbol: "SLR",
    });
  } catch (err) {
    console.error("Faucet error:", err);
    return NextResponse.json(
      { error: "Internal faucet error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    network: "arb-sepolia",
    token: TOKEN_ADDRESS,
  });
}
