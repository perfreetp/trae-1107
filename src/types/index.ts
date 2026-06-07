export type PromotionType =
  | 'full_reduction'
  | 'full_discount'
  | 'second_item'
  | 'combo_price'
  | 'member_price'
  | 'birthday_discount'
  | 'step_gift'
  | 'coupon';

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type ExclusionType = 'mutual_exclusive' | 'stackable' | 'override';

export interface Product {
  skuId: string;
  spuId?: string;
  name: string;
  price: number;
  originalPrice?: number;
  categoryId?: string;
  categoryPath?: string[];
  brandId?: string;
  quantity: number;
  tags?: string[];
  storeId?: string;
}

export interface CartItem extends Product {
  lineId: string;
  appliedDiscount?: number;
  finalPrice?: number;
  promotionIds?: string[];
  shareDetail?: DiscountShareDetail[];
}

export interface Cart {
  items: CartItem[];
  totalAmount: number;
  totalQuantity: number;
  storeId?: string;
  userId?: string;
}

export interface Member {
  memberId: string;
  level: MemberLevel;
  points: number;
  birthday?: string;
  joinDate?: string;
  tags?: string[];
}

export interface PromotionScope {
  productIds?: string[];
  spuIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  excludeProductIds?: string[];
  storeIds?: string[];
  excludeStoreIds?: string[];
  timeRanges?: TimeRange[];
  memberLevels?: MemberLevel[];
  minQuantity?: number;
  minAmount?: number;
}

export interface TimeRange {
  start: string;
  end: string;
  weekdays?: number[];
}

export interface FullReductionRule {
  type: 'full_reduction';
  threshold: number;
  discountAmount: number;
  isCycle?: boolean;
  maxDiscount?: number;
}

export interface FullDiscountRule {
  type: 'full_discount';
  threshold: number;
  discountRate: number;
  maxDiscount?: number;
}

export interface SecondItemRule {
  type: 'second_item';
  discountType: 'discount' | 'fixed_price' | 'free';
  discountRate?: number;
  fixedPrice?: number;
  buyCount: number;
  giftCount: number;
}

export interface ComboPriceRule {
  type: 'combo_price';
  comboPrice: number;
  requiredSkus: { skuId: string; quantity: number }[];
}

export interface MemberPriceRule {
  type: 'member_price';
  memberPrice: number;
  requiredLevels?: MemberLevel[];
}

export interface BirthdayDiscountRule {
  type: 'birthday_discount';
  discountRate: number;
  requiredLevels?: MemberLevel[];
}

export interface StepGiftRule {
  type: 'step_gift';
  steps: {
    threshold: number;
    gifts: GiftItem[];
  }[];
}

export interface GiftItem {
  skuId: string;
  name: string;
  quantity: number;
  price?: number;
}

export type PromotionRule =
  | FullReductionRule
  | FullDiscountRule
  | SecondItemRule
  | ComboPriceRule
  | MemberPriceRule
  | BirthdayDiscountRule
  | StepGiftRule;

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  type: PromotionType;
  rule: PromotionRule;
  scope: PromotionScope;
  priority: number;
  exclusionType: ExclusionType;
  exclusiveWith?: string[];
  stackableWith?: string[];
  startTime: string;
  endTime: string;
  enabled: boolean;
  displayText?: string;
  tags?: string[];
  totalBudget?: number;
  usedBudget?: number;
  totalUsageLimit?: number;
  usedCount?: number;
  perUserLimit?: number;
  userUsedCount?: number;
}

export interface Coupon {
  id: string;
  name: string;
  code?: string;
  type: 'full_reduction' | 'full_discount' | 'fixed_price';
  threshold: number;
  discountAmount?: number;
  discountRate?: number;
  fixedPrice?: number;
  scope: PromotionScope;
  maxDiscount?: number;
  expirationDate: string;
  usedCount?: number;
  totalCount?: number;
  stackableWithPromotions?: boolean;
  exclusiveWith?: string[];
  displayText?: string;
  totalBudget?: number;
  usedBudget?: number;
  perUserLimit?: number;
  userUsedCount?: number;
}

export type CouponSelectionMode = 'auto' | 'manual';

export interface CouponWallet {
  coupons: Coupon[];
  selectedCouponIds?: string[];
  selectionMode?: CouponSelectionMode;
}

export interface ResourceUsage {
  id: string;
  name: string;
  type: 'promotion' | 'coupon';
  budgetUsed?: number;
  budgetRemaining?: number;
  countUsed?: number;
  countRemaining?: number;
  userCountUsed?: number;
  userCountRemaining?: number;
  estimatedBudgetConsumption?: number;
  estimatedCountConsumption?: number;
}

export interface CalculationStepDetail {
  id: string;
  name: string;
  type: 'promotion' | 'coupon';
  promotionType?: PromotionType;
  baseAmount: number;
  discountAmount: number;
  affectedItems: {
    lineId: string;
    skuId: string;
    name: string;
    baseAmount: number;
    shareAmount: number;
    finalAmount: number;
    roundingDiff?: number;
  }[];
  roundingDiff?: number;
  reason?: string;
}

export interface DiscountShareDetail {
  promotionId: string;
  promotionName: string;
  promotionType: PromotionType;
  discountAmount: number;
}

export interface PromotionResult {
  promotionId: string;
  promotionName: string;
  promotionType: PromotionType;
  applied: boolean;
  discountAmount: number;
  hitReason?: string;
  unavailabilityReason?: string;
  affectedItems?: string[];
  gifts?: GiftItem[];
  displayText?: string;
}

export interface UnavailablePromotion {
  promotionId: string;
  promotionName: string;
  reason: string;
  reasonCode: string;
}

export interface CalculationResult {
  originalTotal: number;
  finalTotal: number;
  totalDiscount: number;
  totalPromotionDiscount: number;
  totalCouponDiscount: number;
  appliedPromotions: PromotionResult[];
  unavailablePromotions: UnavailablePromotion[];
  appliedCoupons: PromotionResult[];
  unavailableCoupons: UnavailablePromotion[];
  cartItems: CartItem[];
  gifts: GiftItem[];
  displayMessages: string[];
  resourceUsages: ResourceUsage[];
  calculationSteps: CalculationStepDetail[];
}

export interface TrialRequest {
  cart: Cart;
  member?: Member;
  promotions: Promotion[];
  couponWallet?: CouponWallet;
  currentTime?: string;
  storeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  conflicts: PromotionConflict[];
  warnings: string[];
}

export interface PromotionConflict {
  promotionIds: string[];
  type: 'exclusion' | 'scope_overlap' | 'time_overlap';
  description: string;
}
