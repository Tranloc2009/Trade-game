import { z } from 'zod';

export const GuestLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Tên người chơi tối thiểu 2 ký tự')
    .max(24, 'Tên người chơi tối đa 24 ký tự')
    .regex(/^[a-zA-Z0-9_\-\sÀ-ỹ]+$/, 'Tên chỉ được chứa chữ cái, số, khoảng trắng, _ và -'),
  preset: z.enum(['ALICE', 'BOB', 'CUSTOM']).optional(),
});

export const PlaceOrderSchema = z
  .object({
    symbol: z.string().trim().min(2).max(16),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    timeInForce: z.enum(['GTC', 'IOC']).optional().default('GTC'),
    priceCR: z.number().positive('Giá phải lớn hơn 0').max(10_000_000).optional(),
    quantity: z.number().positive('Khối lượng phải lớn hơn 0').max(1_000_000),
    maxSlippageBps: z.number().int().min(10).max(5000).optional().default(500), // default 5%
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  })
  .refine((data) => data.type === 'MARKET' || (data.priceCR !== undefined && data.priceCR > 0), {
    message: 'Lệnh Limit bắt buộc phải nhập giá hợp lệ',
    path: ['priceCR'],
  });

export const ListPropertySchema = z.object({
  listingPriceCR: z.number().positive().max(1_000_000_000),
});

export const PlaceAuctionBidSchema = z.object({
  bidAmountCR: z.number().positive().max(1_000_000_000),
});

export const CreateCompanySchema = z.object({
  name: z.string().trim().min(3).max(40),
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(6)
    .regex(/^[A-Z0-9]+$/, 'Mã doanh nghiệp chỉ chứa chữ in hoa và số'),
  sector: z.enum([
    'Technology',
    'Manufacturing',
    'Logistics',
    'Real Estate Development',
    'Financial Services',
    'Retail',
    'Energy',
  ]),
  initialCapitalCR: z.number().min(25_000).max(10_000_000),
});

export const CompanyActionSchema = z.object({
  amountCR: z.number().positive().max(50_000_000).optional(),
});

export const BankTransferSchema = z.object({
  amountCR: z.number().positive().max(50_000_000),
});

export const LoanRequestSchema = z.object({
  principalCR: z.number().min(5_000).max(10_000_000),
  termGameDays: z.number().int().min(3).max(30).default(10),
});

export const LoanRepaySchema = z.object({
  amountCR: z.number().positive().max(50_000_000),
});

export const ChatMessageSchema = z.object({
  channel: z.enum(['WORLD', 'MARKET']),
  content: z.string().trim().min(1).max(280),
});

export const EntertainmentPlaySchema = z.object({
  wagerChips: z.number().int().min(10).max(10_000),
  targetMultiplier: z.enum(['2x', '4x', '8x']),
});
