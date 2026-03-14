"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { SessionProvider } from "next-auth/react";

type Props = {
  children: ReactNode;
};

export function ConvexClientProvider({ children }: Props) {
  const client = useMemo(() => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, []);

  if (!client) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <ConvexProvider client={client}>{children}</ConvexProvider>
    </SessionProvider>
  );
}
