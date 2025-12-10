import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { kv } from "@vercel/kv";

const RPC_URL = process.env.ARB_SEPOLIA_RPC_URL!;
const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY!;
const TOKEN_ADDRESS = process.env.SLR_TOKEN_ADDRESS!;
const DECIMALS = Number(process.env.SLR_DECIMALS || 18);
const CLAIM_INTERVAL_HOURS = Number(process.env.CLAIM_INTERVAL_HOURS || 12);
const CLAIM_INTERVAL_MS = CLAIM_INTERVAL_HOURS * 60 * 60 * 1000;

const erc20Abi = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const token = new ethers.Contract(TOKEN_ADDRESS, erc20Abi, wallet);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = body?.address as string | undefined;

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const normalized = address.toLowerCase();
    const claimKey = `claim:${normalized}`;
    
    // Get last claim time from KV
    const lastClaim = await kv.get<number>(claimKey);
    const now = Date.now();

    if (lastClaim && now - lastClaim < CLAIM_INTERVAL_MS) {
      const remainingMs = CLAIM_INTERVAL_MS - (now - lastClaim);
      const remainingHours = (remainingMs / (60 * 60 * 1000)).toFixed(2);
      return NextResponse.json(
        { error: `Already claimed. Try again in ~${remainingHours} hours.` },
        { status: 429 }
      );
    }

    // Check faucet balance
    const faucetBalance = await token.balanceOf(wallet.address);
    const amount = ethers.parseUnits("5", DECIMALS);

    if (faucetBalance < amount) {
      return NextResponse.json({ error: "Faucet is empty" }, { status: 500 });
    }

    // Send tokens
    const tx = await token.transfer(address, amount);

    // Store claim time in KV with auto-expiry
    await kv.set(claimKey, now, { ex: Math.floor(CLAIM_INTERVAL_MS / 1000) });

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: "5",
      symbol: "SLR",
    });
  } catch (err: any) {
    console.error("Faucet error:", err);
    return NextResponse.json(
      { error: "Internal faucet error: " + err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      status: "ok",
      network: "Arbitrum Sepolia",
      token: TOKEN_ADDRESS,
      faucetBalance: (await token.balanceOf(wallet.address)).toString(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}
