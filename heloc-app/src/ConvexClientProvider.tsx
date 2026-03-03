import type { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

// Fail gracefully if no URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const ConvexClientProvider = ({ children }: { children: ReactNode }) => {
    if (!convex) {
        return <>{children}</>;
    }
    return <ConvexProvider client={convex}>{children}</ConvexProvider>;
};
