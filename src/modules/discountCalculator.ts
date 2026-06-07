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
  Member
} from '../types';
import { roundToTwo, calculateItemTotal } from '../utils';
import { MatchResult } from './productMatcher';

export interface DiscountCalculation {
  discountAmount: number;
  affectedItems: string[];
  gifts?: GiftItem[];
  unitDiscounts?: { lineId: string; unitDiscount: number }[];
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
    const unitDiscounts: { lineId: string; unitDiscount: number }[] = [];

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
        unitDiscounts.push({ lineId: item.lineId, unitDiscount: roundToTwo(unitDiscount) });
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
    const unitDiscounts: { lineId: string; unitDiscount: number }[] = [];

    for (const item of matchedItems) {
      if (item.price > rule.memberPrice) {
        const unitDiscount = item.price - rule.memberPrice;
        discountAmount += unitDiscount * item.quantity;
        affectedLineIds.push(item.lineId);
        unitDiscounts.push({ lineId: item.lineId, unitDiscount: roundToTwo(unitDiscount) });
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
}
