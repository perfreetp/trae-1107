import {
  Promotion,
  PromotionRule,
  FullReductionRule,
  FullDiscountRule,
  SecondItemRule,
  ComboPriceRule,
  MemberPriceRule,
  BirthdayDiscountRule,
  StepGiftRule,
  CartItem,
  GiftItem,
  Member,
  ResourceUsage
} from '../types';
import { roundToTwo, calculateItemTotal } from '../utils';
import { MatchResult } from './productMatcher';

export interface DiscountCalculation {
  discountAmount: number;
  affectedItems: string[];
  gifts?: GiftItem[];
  unitDiscounts?: { lineId: string; unitDiscount: number; discountedQuantity: number }[];
}

export class DiscountCalculator {
  calculate(
    promotion: Promotion,
    matchResult: MatchResult,
    member?: Member
  ): DiscountCalculation {
    const rule = promotion.rule;

    switch (rule.type) {
      case 'full_reduction':
        return this.calculateFullReduction(rule, matchResult);
      case 'full_discount':
        return this.calculateFullDiscount(rule, matchResult);
      case 'second_item':
        return this.calculateSecondItem(rule, matchResult);
      case 'combo_price':
        return this.calculateComboPrice(rule, matchResult);
      case 'member_price':
        return this.calculateMemberPrice(rule, matchResult, member);
      case 'birthday_discount':
        return this.calculateBirthdayDiscount(rule, matchResult, member);
      case 'step_gift':
        return this.calculateStepGift(rule, matchResult);
      default:
        return { discountAmount: 0, affectedItems: [] };
    }
  }

  private calculateFullReduction(
    rule: FullReductionRule,
    matchResult: MatchResult
  ): DiscountCalculation {
    const { matchedAmount, matchedItems } = matchResult;

    if (matchedAmount < rule.threshold) {
      return { discountAmount: 0, affectedItems: [] };
    }

    let discountAmount = 0;
    if (rule.isCycle) {
      const times = Math.floor(matchedAmount / rule.threshold);
      discountAmount = times * rule.discountAmount;
    } else {
      discountAmount = rule.discountAmount;
    }

    if (rule.maxDiscount && discountAmount > rule.maxDiscount) {
      discountAmount = rule.maxDiscount;
    }

    if (discountAmount > matchedAmount) {
      discountAmount = matchedAmount;
    }

    return {
      discountAmount: roundToTwo(discountAmount),
      affectedItems: matchedItems.map(item => item.lineId)
    };
  }

  private calculateFullDiscount(
    rule: FullDiscountRule,
    matchResult: MatchResult
  ): DiscountCalculation {
    const { matchedAmount, matchedItems } = matchResult;

    if (matchedAmount < rule.threshold) {
      return { discountAmount: 0, affectedItems: [] };
    }

    let discountAmount = matchedAmount * (1 - rule.discountRate);

    if (rule.maxDiscount && discountAmount > rule.maxDiscount) {
      discountAmount = rule.maxDiscount;
    }

    return {
      discountAmount: roundToTwo(discountAmount),
      affectedItems: matchedItems.map(item => item.lineId)
    };
  }

  private calculateSecondItem(
    rule: SecondItemRule,
    matchResult: MatchResult
  ): DiscountCalculation {
    const { matchedItems, matchedQuantity } = matchResult;

    if (matchedQuantity < rule.buyCount + rule.giftCount) {
      return { discountAmount: 0, affectedItems: [] };
    }

    const sortedItems = [...matchedItems].sort((a, b) => a.price - b.price);
    const groups = Math.floor(matchedQuantity / (rule.buyCount + rule.giftCount));
    const giftItemsToDiscount = groups * rule.giftCount;

    let discountAmount = 0;
    let giftedCount = 0;
    const affectedLineIds: string[] = [];
    const unitDiscounts: { lineId: string; unitDiscount: number; discountedQuantity: number }[] = [];

    for (const item of sortedItems) {
      if (giftedCount >= giftItemsToDiscount) break;

      const canGiftFromThisItem = Math.min(item.quantity, giftItemsToDiscount - giftedCount);

      if (canGiftFromThisItem > 0) {
        let unitDiscount = 0;
        switch (rule.discountType) {
          case 'free':
            unitDiscount = item.price;
            break;
          case 'discount':
            unitDiscount = item.price * (1 - (rule.discountRate || 1));
            break;
          case 'fixed_price':
            unitDiscount = item.price - (rule.fixedPrice || 0);
            break;
        }

        discountAmount += unitDiscount * canGiftFromThisItem;
        giftedCount += canGiftFromThisItem;
        affectedLineIds.push(item.lineId);
        unitDiscounts.push({
          lineId: item.lineId,
          unitDiscount: roundToTwo(unitDiscount),
          discountedQuantity: canGiftFromThisItem
        });
      }
    }

    return {
      discountAmount: roundToTwo(discountAmount),
      affectedItems: affectedLineIds,
      unitDiscounts
    };
  }

  private calculateComboPrice(
    rule: ComboPriceRule,
    matchResult: MatchResult
  ): DiscountCalculation {
    const { matchedItems } = matchResult;

    const requiredSkus = rule.requiredSkus;
    let comboCount = Infinity;

    for (const required of requiredSkus) {
      const item = matchedItems.find(i => i.skuId === required.skuId);
      if (!item || item.quantity < required.quantity) {
        return { discountAmount: 0, affectedItems: [] };
      }
      comboCount = Math.min(comboCount, Math.floor(item.quantity / required.quantity));
    }

    if (comboCount === 0 || comboCount === Infinity) {
      return { discountAmount: 0, affectedItems: [] };
    }

    let originalTotal = 0;
    const affectedLineIds: string[] = [];

    for (const required of requiredSkus) {
      const item = matchedItems.find(i => i.skuId === required.skuId)!;
      originalTotal += item.price * required.quantity * comboCount;
      affectedLineIds.push(item.lineId);
    }

    const discountAmount = originalTotal - rule.comboPrice * comboCount;

    return {
      discountAmount: roundToTwo(Math.max(0, discountAmount)),
      affectedItems: affectedLineIds
    };
  }

  private calculateMemberPrice(
    rule: MemberPriceRule,
    matchResult: MatchResult,
    member?: Member
  ): DiscountCalculation {
    const { matchedItems } = matchResult;

    if (!member) {
      return { discountAmount: 0, affectedItems: [] };
    }

    if (rule.requiredLevels && rule.requiredLevels.length > 0) {
      if (!rule.requiredLevels.includes(member.level)) {
        return { discountAmount: 0, affectedItems: [] };
      }
    }

    let discountAmount = 0;
    const affectedLineIds: string[] = [];
    const unitDiscounts: { lineId: string; unitDiscount: number; discountedQuantity: number }[] = [];

    for (const item of matchedItems) {
      if (item.price > rule.memberPrice) {
        const unitDiscount = item.price - rule.memberPrice;
        discountAmount += unitDiscount * item.quantity;
        affectedLineIds.push(item.lineId);
        unitDiscounts.push({
          lineId: item.lineId,
          unitDiscount: roundToTwo(unitDiscount),
          discountedQuantity: item.quantity
        });
      }
    }

    return {
      discountAmount: roundToTwo(discountAmount),
      affectedItems: affectedLineIds,
      unitDiscounts
    };
  }

  private calculateBirthdayDiscount(
    rule: BirthdayDiscountRule,
    matchResult: MatchResult,
    member?: Member
  ): DiscountCalculation {
    const { matchedItems, matchedAmount } = matchResult;

    if (!member) {
      return { discountAmount: 0, affectedItems: [] };
    }

    if (rule.requiredLevels && rule.requiredLevels.length > 0) {
      if (!rule.requiredLevels.includes(member.level)) {
        return { discountAmount: 0, affectedItems: [] };
      }
    }

    const discountAmount = matchedAmount * (1 - rule.discountRate);

    return {
      discountAmount: roundToTwo(discountAmount),
      affectedItems: matchedItems.map(item => item.lineId)
    };
  }

  private calculateStepGift(
    rule: StepGiftRule,
    matchResult: MatchResult
  ): DiscountCalculation {
    const { matchedAmount, matchedItems } = matchResult;

    let maxStep = 0;
    let gifts: GiftItem[] = [];

    for (const step of rule.steps) {
      if (matchedAmount >= step.threshold && step.threshold > maxStep) {
        maxStep = step.threshold;
        gifts = step.gifts;
      }
    }

    if (gifts.length === 0) {
      return { discountAmount: 0, affectedItems: [] };
    }

    return {
      discountAmount: 0,
      affectedItems: matchedItems.map(item => item.lineId),
      gifts
    };
  }

  calculateResourceUsage(promotion: Promotion, discountAmount: number): ResourceUsage {
    const usage: ResourceUsage = {
      id: promotion.id,
      name: promotion.name,
      type: 'promotion',
      estimatedBudgetConsumption: discountAmount > 0 ? discountAmount : undefined,
      estimatedCountConsumption: 1
    };

    if (promotion.totalBudget !== undefined) {
      usage.budgetUsed = promotion.usedBudget || 0;
      usage.budgetRemaining = promotion.totalBudget - (promotion.usedBudget || 0);
    }
    if (promotion.totalUsageLimit !== undefined) {
      usage.countUsed = promotion.usedCount || 0;
      usage.countRemaining = promotion.totalUsageLimit - (promotion.usedCount || 0);
    }
    if (promotion.perUserLimit !== undefined) {
      usage.userCountUsed = promotion.userUsedCount || 0;
      usage.userCountRemaining = promotion.perUserLimit - (promotion.userUsedCount || 0);
    }

    return usage;
  }

  checkResourceLimits(promotion: Promotion, discountAmount: number): { valid: boolean; reason?: string; reasonCode?: string } {
    if (promotion.totalUsageLimit !== undefined && promotion.usedCount !== undefined) {
      if (promotion.usedCount >= promotion.totalUsageLimit) {
        return { valid: false, reason: '活动总使用次数已达上限', reasonCode: 'USAGE_LIMIT_REACHED' };
      }
    }

    if (promotion.perUserLimit !== undefined && promotion.userUsedCount !== undefined) {
      if (promotion.userUsedCount >= promotion.perUserLimit) {
        return { valid: false, reason: `用户已达活动使用上限，最多可用 ${promotion.perUserLimit} 次`, reasonCode: 'USER_LIMIT_REACHED' };
      }
    }

    if (promotion.totalBudget !== undefined && promotion.usedBudget !== undefined) {
      if (promotion.usedBudget >= promotion.totalBudget) {
        return { valid: false, reason: '活动预算已用完', reasonCode: 'BUDGET_EXHAUSTED' };
      }
      if (discountAmount > 0) {
        const remainingBudget = promotion.totalBudget - promotion.usedBudget;
        if (discountAmount > remainingBudget) {
          return {
            valid: false,
            reason: `活动剩余预算不足，剩余 ${remainingBudget.toFixed(2)} 元，需 ${discountAmount.toFixed(2)} 元`,
            reasonCode: 'BUDGET_INSUFFICIENT'
          };
        }
      }
    }

    return { valid: true };
  }
}
