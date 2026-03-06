import { z } from "zod";
import type { NetWorthCategory } from "@/lib/types";
import { isCategoryValidForEntryType } from "@/lib/net-worth";

const isoDateWithTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const tradePayloadSchema = z.object({
  portfolioId: z.number().int().positive("Portfolio is required"),
  symbol: z.string().min(1),
  assetType: z.enum(["equity", "crypto"]),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: z.number().positive("Price must be greater than 0"),
  fee: z.number().min(0, "Fee must be at least 0").optional().default(0),
  tradedAt: isoDateWithTime,
  notes: z.string().max(500).optional().nullable(),
  name: z.string().max(100).optional().nullable(),
});

export type TradePayload = z.infer<typeof tradePayloadSchema>;

export const portfolioCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export type PortfolioCreatePayload = z.infer<typeof portfolioCreateSchema>;

const normalizedLabel = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(100, "Label must be at most 100 characters");

const categoryEnum = z.enum([
  "house",
  "car",
  "jewelry",
  "cash",
  "mortgage",
  "car_lease",
]);

export const netWorthEntryCreateSchema = z
  .object({
    entryType: z.enum(["asset", "debt"]),
    category: categoryEnum,
    label: normalizedLabel,
    amount: z.number().min(0, "Amount must be 0 or greater"),
  })
  .superRefine((value, ctx) => {
    if (!isCategoryValidForEntryType(value.entryType, value.category as NetWorthCategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Category is not valid for the selected entry type",
      });
    }
  });

export const netWorthEntryUpdateSchema = z.object({
  label: normalizedLabel,
  amount: z.number().min(0, "Amount must be 0 or greater"),
});

export type NetWorthEntryCreatePayload = z.infer<typeof netWorthEntryCreateSchema>;
export type NetWorthEntryUpdatePayload = z.infer<typeof netWorthEntryUpdateSchema>;
