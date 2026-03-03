import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Simple password hashing (In prod, use a dedicated auth provider or bcrypt)
// Since this is a restricted environment, we'll simulate hash for now.
function hashPassword(password: string) {
    // In a real app, use a crypto library.
    // For this prototype, we'll assume the client sends a hash or we store as plain (NOT RECOMMENDED for prod)
    // Let's at least do a simple salt/transform to not be plain text.
    return "hashed_" + password;
}

export const login = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (!user) {
            return { error: "User not found" };
        }

        if (user.passwordHash !== hashPassword(args.password)) {
            return { error: "Invalid password" };
        }

        // Auto-promote specific email to admin if not already
        if (args.email === "barraganmortgage@gmail.com" && user.role !== "admin") {
            await ctx.db.patch(user._id, { role: "admin", subscriptionTier: "enterprise" });
            user.role = "admin";
            user.subscriptionTier = "enterprise";
        }

        return {
            userId: user._id,
            email: user.email,
            role: user.role,
            subscriptionTier: user.subscriptionTier,
            integrations: user.integrations
        };
    },
});

export const register = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (existing) {
            return { error: "Email already registered" };
        }

        // First user is Admin, OR specific email is always admin
        const allUsers = await ctx.db.query("users").take(1);
        let role = allUsers.length === 0 ? "admin" : "user";

        if (args.email === "barraganmortgage@gmail.com") {
            role = "admin";
        }

        const userId = await ctx.db.insert("users", {
            email: args.email,
            passwordHash: hashPassword(args.password),
            role: role,
            subscriptionTier: role === "admin" ? "enterprise" : "free",
            usageCount: 0,
            createdAt: Date.now(),
        });

        return { userId, role };
    },
});

export const createQuote = mutation({
    args: {
        userId: v.id("users"),
        clientName: v.string(),
        quoteData: v.string(),
    },
    handler: async (ctx, args) => {
        // Validation: Verify userId exists (or verify session token in future)
        const user = await ctx.db.get(args.userId);
        if (!user) {
            throw new Error("Invalid user");
        }

        const quoteId = await ctx.db.insert("quotes", {
            userId: args.userId,
            clientName: args.clientName,
            quoteData: args.quoteData,
            createdAt: Date.now(),
        });

        // Update usage count
        await ctx.db.patch(args.userId, {
            usageCount: (user.usageCount || 0) + 1,
        });

        return { quoteId };
    },
});

export const updateIntegration = mutation({
    args: {
        userId: v.id("users"),
        provider: v.string(), // "ghl" or "n8n"
        data: v.object({
            apiKey: v.optional(v.string()),
            locationId: v.optional(v.string()),
            webhookUrl: v.optional(v.string()),
        })
    },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);
        if (!user) throw new Error("User not found");

        // TODO: Verify request comes from Admin or the User themselves (via auth token)
        // For now, allow open update for MVP testing

        const currentIntegrations = user.integrations || {};
        const updatedProvider = { ...currentIntegrations[args.provider as keyof typeof currentIntegrations], ...args.data };

        await ctx.db.patch(args.userId, {
            integrations: {
                ...currentIntegrations,
                [args.provider]: updatedProvider
            }
        });
    }
});

export const getUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    }
});
// ===== ADMIN FUNCTIONS =====

export const listUsers = query({
    handler: async (ctx) => {
        // TODO: In production, verify ctx.auth or pass an admin token/ID to verify
        // For now, we rely on client-side role check + obscured UI
        // Ideally: const identity = await ctx.auth.getUserIdentity(); if (identity.role !== 'admin') throw...
        return await ctx.db.query("users").collect();
    }
});

export const updateUserAdmin = mutation({
    args: {
        adminUserId: v.id("users"), // Requesting admin
        targetUserId: v.id("users"), // User to update
        updates: v.object({
            role: v.optional(v.string()),
            subscriptionTier: v.optional(v.string()),
            integrations: v.optional(v.object({
                ghl: v.optional(v.object({
                    apiKey: v.optional(v.string()),
                    locationId: v.optional(v.string()),
                })),
                n8n: v.optional(v.object({
                    webhookUrl: v.optional(v.string()),
                })),
            }))
        })
    },
    handler: async (ctx, args) => {
        const admin = await ctx.db.get(args.adminUserId);
        if (!admin || admin.role !== 'admin') {
            throw new Error("Unauthorized: Admin access required");
        }

        const target = await ctx.db.get(args.targetUserId);
        if (!target) throw new Error("Target user not found");

        // Merge integrations carefully to not overwrite missing fields with undefined if partial
        const newIntegrations = target.integrations || {};

        if (args.updates.integrations) {
            if (args.updates.integrations.ghl) {
                newIntegrations.ghl = { ...newIntegrations.ghl, ...args.updates.integrations.ghl };
            }
            if (args.updates.integrations.n8n) {
                newIntegrations.n8n = { ...newIntegrations.n8n, ...args.updates.integrations.n8n };
            }
        }

        await ctx.db.patch(args.targetUserId, {
            ...args.updates,
            integrations: newIntegrations
        });
    }
});
