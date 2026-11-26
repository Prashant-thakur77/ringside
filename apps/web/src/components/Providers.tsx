"use client";
import { Buffer } from "buffer";
if (typeof window !== "undefined") (window as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SessionWalletProvider, useSessionKeyManager } from "@magicblock-labs/gum-react-sdk";
import { useMemo, useState, type ReactNode } from "react";
import { SOLANA_RPC } from "@/lib/config";
import "@solana/wallet-adapter-react-ui/styles.css";

function Sessions({ children }: { children: ReactNode }) {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const session = useSessionKeyManager(wallet!, connection, "devnet");
  return <SessionWalletProvider sessionWallet={session}>{children}</SessionWalletProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <QueryClientProvider client={qc}>
      <ConnectionProvider endpoint={SOLANA_RPC}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <Sessions>{children}</Sessions>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
