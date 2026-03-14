"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

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
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
