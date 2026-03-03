import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        email: v.string(),
        passwordHash: v.string(), // Hashed password
        role: v.string(), // "super_admin", "admin", "user"
        subscriptionTier: v.string(), // "free", "pro", "enterprise"
        stripeCustomerId: v.optional(v.string()),
        usageCount: v.number(), // Track number of quotes generated
        impersonationToken: v.optional(v.string()), // For "Login As" feature
        createdAt: v.number(),
        // Per-user integrations
        integrations: v.optional(v.object({
            ghl: v.optional(v.object({
                apiKey: v.optional(v.string()),
                locationId: v.optional(v.string()),
            })),
            n8n: v.optional(v.object({
                webhookUrl: v.optional(v.string()),
            })),
        })),
    }).index("by_email", ["email"]).index("by_stripe_id", ["stripeCustomerId"]),

    quotes: defineTable({
        userId: v.id("users"),
        clientName: v.string(),
        quoteData: v.string(), // JSON string of the full quote inputs/outputs
        createdAt: v.number(),
    }).index("by_user", ["userId"]),

    subscriptions: defineTable({
        userId: v.id("users"),
        stripeSubscriptionId: v.string(),
        status: v.string(), // "active", "canceled", "past_due"
        currentPeriodEnd: v.number(),
        planId: v.string(),
    }).index("by_user", ["userId"]).index("by_stripe_sub", ["stripeSubscriptionId"]),

    // Global settings or legacy leads (optional to keep)
    leads: defineTable({
        campaign: v.optional(v.string()),
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        data: v.any(),
        parsedAt: v.number(),
    }),
});
