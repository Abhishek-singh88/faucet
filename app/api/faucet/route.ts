import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";

const RPC_URL = process.env.ARB_SEPOLIA_RPC_URL!;
const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY!;
const TOKEN_ADDRESS = process.env.SLR_TOKEN_ADDRESS!;
const DECIMALS = Number(process.env.SLR_DECIMALS || 18);
const CLAIM_INTERVAL_HOURS = Number(process.env.CLAIM_INTERVAL_HOURS || 12);
const CLAIM_INTERVAL_MS = CLAIM_INTERVAL_HOURS * 60 * 60 * 1000;

const CLAIMS_FILE = path.join(process.cwd(), "claims.json");

// Minimal ERC20 ABI
const erc20Abi = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const token = new ethers.Contract(TOKEN_ADDRESS, erc20Abi, wallet);

// Load claims from JSON file
async function loadClaims(): Promise<Map<string, number>> {
  try {
    const data = await fs.readFile(CLAIMS_FILE, "utf8");
    const claims = JSON.parse(data);
    return new Map(Object.entries(claims));
  } catch (error) {
    // File doesn't exist or empty - return empty map
    return new Map();
  }
}

// Save claims to JSON file
async function saveClaims(claims: Map<string, number>): Promise<void> {
  const data = JSON.stringify(Object.fromEntries(claims), null, 2);
  await fs.writeFile(CLAIMS_FILE, data, "utf8");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = body?.address as string | undefined;

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Load claims from persistent storage
    const lastClaimMap = await loadClaims();
    const normalized = address.toLowerCase();
    const now = Date.now();
    const last = lastClaimMap.get(normalized) ?? 0;

    if (now - last < CLAIM_INTERVAL_MS) {
      const remainingMs = CLAIM_INTERVAL_MS - (now - last);
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
    const tx = await token.transfer(address, amount, {
      gasLimit: 100000, // Optional: set gas limit
    });

    // Update claims and save to file
    lastClaimMap.set(normalized, now);
    await saveClaims(lastClaimMap);

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
    const claims = await loadClaims();
    return NextResponse.json({
      status: "ok",
      network: "Arbitrum Sepolia",
      token: TOKEN_ADDRESS,
      faucetBalance: (await token.balanceOf(wallet.address)).toString(),
      totalClaims: claims.size,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}
