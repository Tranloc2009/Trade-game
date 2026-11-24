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
    symbol: z.string().trim().min(2).max(24),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    timeInForce: z.enum(['GTC', 'IOC']).optional().default('GTC'),
    priceCR: z.number().positive('Giá phải lớn hơn 0').max(10_000_000).optional(),
    quantity: z.number().positive('Khối lượng phải lớn hơn 0').max(10_000_000),
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

export const PropertyCollateralLoanSchema = z.object({
  principalCR: z.number().min(5_000, 'Khoản vay tối thiểu 5,000 CR').max(50_000_000),
  termGameDays: z.number().int().min(5).max(30).default(15),
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

export const PlaceFuturesOrderSchema = z
  .object({
    symbol: z.string().trim().min(4).max(24),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum([
      'MARKET',
      'LIMIT',
      'STOP_MARKET',
      'STOP_LIMIT',
      'TAKE_PROFIT_MARKET',
      'TAKE_PROFIT_LIMIT',
    ]),
    timeInForce: z.enum(['GTC', 'IOC']).optional().default('GTC'),
    marginMode: z.enum(['ISOLATED', 'CROSS']).optional().default('ISOLATED'),
    leverage: z.number().int().min(1).max(20).optional().default(1),
    priceCR: z.number().positive('Giá đặt phải lớn hơn 0').max(10_000_000).optional(),
    triggerPriceCR: z.number().positive('Giá kích hoạt phải lớn hơn 0').max(10_000_000).optional(),
    triggerSource: z.enum(['MARK_PRICE', 'LAST_PRICE']).optional().default('MARK_PRICE'),
    quantity: z.number().positive('Khối lượng phải lớn hơn 0').max(10_000_000),
    reduceOnly: z.boolean().optional().default(false),
    postOnly: z.boolean().optional().default(false),
    stopLossCR: z.number().positive('Giá Stop Loss phải lớn hơn 0').max(10_000_000).optional(),
    takeProfitCR: z.number().positive('Giá Take Profit phải lớn hơn 0').max(10_000_000).optional(),
    maxSlippageBps: z.number().int().min(10).max(5000).optional().default(500),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  })
  .refine(
    (d) =>
      d.type === 'MARKET' ||
      d.type === 'STOP_MARKET' ||
      d.type === 'TAKE_PROFIT_MARKET' ||
      (d.priceCR !== undefined && d.priceCR > 0),
    {
      message: 'Lệnh Limit bắt buộc phải nhập mức giá hợp lệ.',
      path: ['priceCR'],
    },
  )
  .refine(
    (d) =>
      d.type === 'MARKET' ||
      d.type === 'LIMIT' ||
      (d.triggerPriceCR !== undefined && d.triggerPriceCR > 0),
    {
      message: 'Lệnh điều kiện (Stop Loss / Take Profit) bắt buộc phải nhập giá kích hoạt.',
      path: ['triggerPriceCR'],
    },
  );

export const FuturesAddMarginSchema = z.object({
  amountCR: z.number().positive('Số CR ký quỹ thêm phải lớn hơn 0').max(50_000_000),
});

export const FuturesClosePositionSchema = z.object({
  type: z.enum(['MARKET', 'LIMIT']).optional().default('MARKET'),
  priceCR: z.number().positive().max(10_000_000).optional(),
  quantity: z.number().positive().max(10_000_000).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

export const FuturesAcknowledgeRiskSchema = z.object({
  acknowledged: z.literal(true),
});

