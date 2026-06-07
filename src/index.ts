export * from './types';

export { ProductMatcher } from './modules/productMatcher';
export { MemberChecker } from './modules/memberChecker';
export { DiscountCalculator } from './modules/discountCalculator';
export { CouponHandler } from './modules/couponHandler';
export { ExclusionChecker } from './modules/exclusionChecker';
export { ResultExplainer } from './modules/resultExplainer';
export { DiscountAllocator } from './modules/discountAllocator';
export { TrialCalculator } from './modules/trialCalculator';

export * from './utils';

import { TrialCalculator } from './modules/trialCalculator';
import { TrialRequest, CalculationResult, ValidationResult, Promotion } from './types';

export class RetailPromotionSDK {
  private trialCalculator: TrialCalculator;

  constructor() {
    this.trialCalculator = new TrialCalculator();
  }

  calculate(request: TrialRequest): CalculationResult {
    return this.trialCalculator.calculate(request);
  }

  validatePromotions(promotions: Promotion[]): ValidationResult {
    return this.trialCalculator.validatePromotions(promotions);
  }

  findBestCombination(
    items: any[],
    promotions: Promotion[],
    currentTime: string,
    member?: any
  ): { promotionIds: string[]; totalDiscount: number } {
    return this.trialCalculator.findBestCombination(items, promotions, currentTime, member);
  }
}

export default RetailPromotionSDK;
