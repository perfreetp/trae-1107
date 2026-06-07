import { Coupon, CouponWallet, CartItem, Member, ResourceUsage } from '../types';
import { isProductInScope, isInAnyTimeRange, roundToTwo, calculateItemTotal } from '../utils';
import { MatchResult } from './productMatcher';

export interface CouponCalculation {
  couponId: string;
  couponName: string;
  applicable: boolean;
  discountAmount: number;
  affectedItems: string[];
  matchedItems: CartItem[];
  matchedAmount: number;
  unavailabilityReason?: string;
  unavailabilityReasonCode?: string;
  coupon: Coupon;
  excludedBy?: string[];
}

export class CouponHandler {
  private checkStoreMatch(coupon: Coupon, orderStoreId?: string): { matched: boolean; reason?: string } {
    if (coupon.scope.storeIds && coupon.scope.storeIds.length > 0) {
      if (!orderStoreId) {
        return { matched: false, reason: '未指定门店，无法使用该门店券' };
      }
      if (!coupon.scope.storeIds.includes(orderStoreId)) {
        return { matched: false, reason: `当前门店不参与此券，适用门店：${coupon.scope.storeIds.join('、')}` };
      }
    }
    return { matched: true };
  }

  calculateCouponDiscount(
    coupon: Coupon,
    items: CartItem[],
    currentTime: string,
    member?: Member,
    orderStoreId?: string
  ): CouponCalculation {
    const now = new Date(currentTime);
    const expirationDate = new Date(coupon.expirationDate);

    if (now > expirationDate) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        matchedItems: [],
        matchedAmount: 0,
        unavailabilityReason: '优惠券已过期',
        unavailabilityReasonCode: 'EXPIRED',
        coupon
      };
    }

    const storeCheck = this.checkStoreMatch(coupon, orderStoreId);
    if (!storeCheck.matched) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        matchedItems: [],
        matchedAmount: 0,
        unavailabilityReason: storeCheck.reason,
        unavailabilityReasonCode: 'NOT_IN_STORE',
        coupon
      };
    }

    if (coupon.totalCount !== undefined && coupon.usedCount !== undefined) {
      if (coupon.usedCount >= coupon.totalCount) {
        return {
          couponId: coupon.id,
          couponName: coupon.name,
          applicable: false,
          discountAmount: 0,
          affectedItems: [],
          matchedItems: [],
          matchedAmount: 0,
          unavailabilityReason: '优惠券已被领取完',
          unavailabilityReasonCode: 'OUT_OF_STOCK',
          coupon
        };
      }
    }

    if (coupon.totalBudget !== undefined && coupon.usedBudget !== undefined) {
      if (coupon.usedBudget >= coupon.totalBudget) {
        return {
          couponId: coupon.id,
          couponName: coupon.name,
          applicable: false,
          discountAmount: 0,
          affectedItems: [],
          matchedItems: [],
          matchedAmount: 0,
          unavailabilityReason: '优惠券预算已用完',
          unavailabilityReasonCode: 'BUDGET_EXHAUSTED',
          coupon
        };
      }
    }

    if (coupon.perUserLimit !== undefined && coupon.userUsedCount !== undefined) {
      if (coupon.userUsedCount >= coupon.perUserLimit) {
        return {
          couponId: coupon.id,
          couponName: coupon.name,
          applicable: false,
          discountAmount: 0,
          affectedItems: [],
          matchedItems: [],
          matchedAmount: 0,
          unavailabilityReason: `用户已达使用上限，最多可用 ${coupon.perUserLimit} 张`,
          unavailabilityReasonCode: 'USER_LIMIT_REACHED',
          coupon
        };
      }
    }

    const matchedItems = items.filter(item => {
      if (!isProductInScope(item, coupon.scope, orderStoreId)) {
        return false;
      }

      if (coupon.scope.timeRanges && coupon.scope.timeRanges.length > 0) {
        if (!isInAnyTimeRange(coupon.scope.timeRanges, currentTime)) {
          return false;
        }
      }

      return true;
    });

    const matchedAmount = matchedItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const matchedQuantity = matchedItems.reduce((sum, item) => sum + item.quantity, 0);

    if (coupon.scope.minAmount && matchedAmount < coupon.scope.minAmount) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        matchedItems,
        matchedAmount,
        unavailabilityReason: `金额未达到优惠券使用门槛，当前 ${matchedAmount.toFixed(2)} 元，需满 ${coupon.scope.minAmount} 元`,
        unavailabilityReasonCode: 'BELOW_THRESHOLD',
        coupon
      };
    }

    if (coupon.scope.minQuantity && matchedQuantity < coupon.scope.minQuantity) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        matchedItems,
        matchedAmount,
        unavailabilityReason: `数量未达到优惠券使用门槛，当前 ${matchedQuantity} 件，需满 ${coupon.scope.minQuantity} 件`,
        unavailabilityReasonCode: 'BELOW_THRESHOLD',
        coupon
      };
    }

    if (matchedAmount < coupon.threshold) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        matchedItems,
        matchedAmount,
        unavailabilityReason: `金额未达到优惠券门槛，当前 ${matchedAmount.toFixed(2)} 元，需满 ${coupon.threshold} 元`,
        unavailabilityReasonCode: 'BELOW_THRESHOLD',
        coupon
      };
    }

    let discountAmount = 0;
    switch (coupon.type) {
      case 'full_reduction':
        discountAmount = coupon.discountAmount || 0;
        break;
      case 'full_discount':
        discountAmount = matchedAmount * (1 - (coupon.discountRate || 1));
        break;
      case 'fixed_price':
        discountAmount = matchedAmount - (coupon.fixedPrice || matchedAmount);
        break;
    }

    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }

    if (discountAmount > matchedAmount) {
      discountAmount = matchedAmount;
    }

    discountAmount = roundToTwo(discountAmount);

    if (coupon.totalBudget !== undefined && coupon.usedBudget !== undefined) {
      const remainingBudget = coupon.totalBudget - coupon.usedBudget;
      if (discountAmount > remainingBudget) {
        return {
          couponId: coupon.id,
          couponName: coupon.name,
          applicable: false,
          discountAmount: 0,
          affectedItems: [],
          matchedItems,
          matchedAmount,
          unavailabilityReason: `优惠券剩余预算不足，剩余 ${remainingBudget.toFixed(2)} 元，需 ${discountAmount.toFixed(2)} 元`,
          unavailabilityReasonCode: 'BUDGET_INSUFFICIENT',
          coupon
        };
      }
    }

    return {
      couponId: coupon.id,
      couponName: coupon.name,
      applicable: true,
      discountAmount,
      affectedItems: matchedItems.map(item => item.lineId),
      matchedItems,
      matchedAmount,
      coupon
    };
  }

  calculateResourceUsage(coupon: Coupon, discountAmount: number): ResourceUsage {
    const usage: ResourceUsage = {
      id: coupon.id,
      name: coupon.name,
      type: 'coupon',
      estimatedBudgetConsumption: discountAmount,
      estimatedCountConsumption: 1
    };

    if (coupon.totalBudget !== undefined) {
      usage.budgetUsed = coupon.usedBudget || 0;
      usage.budgetRemaining = coupon.totalBudget - (coupon.usedBudget || 0);
    }
    if (coupon.totalCount !== undefined) {
      usage.countUsed = coupon.usedCount || 0;
      usage.countRemaining = coupon.totalCount - (coupon.usedCount || 0);
    }
    if (coupon.perUserLimit !== undefined) {
      usage.userCountUsed = coupon.userUsedCount || 0;
      usage.userCountRemaining = coupon.perUserLimit - (coupon.userUsedCount || 0);
    }

    return usage;
  }

  getAvailableCoupons(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member,
    orderStoreId?: string
  ): CouponCalculation[] {
    return couponWallet.coupons.map(coupon =>
      this.calculateCouponDiscount(coupon, items, currentTime, member, orderStoreId)
    );
  }

  areCouponsStackable(couponA: Coupon, couponB: Coupon): boolean {
    if (couponA.exclusiveWith && couponA.exclusiveWith.includes(couponB.id)) {
      return false;
    }
    if (couponB.exclusiveWith && couponB.exclusiveWith.includes(couponA.id)) {
      return false;
    }
    return true;
  }

  private generateSubsets<T>(arr: T[]): T[][] {
    const subsets: T[][] = [];
    const n = arr.length;
    for (let mask = 0; mask < (1 << n); mask++) {
      const subset: T[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(arr[i]);
        }
      }
      subsets.push(subset);
    }
    return subsets;
  }

  private isCombinationValid(calcs: CouponCalculation[]): boolean {
    for (let i = 0; i < calcs.length; i++) {
      for (let j = i + 1; j < calcs.length; j++) {
        if (!this.areCouponsStackable(calcs[i].coupon, calcs[j].coupon)) {
          return false;
        }
      }
    }
    return true;
  }

  getBestCouponCombination(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member,
    orderStoreId?: string,
    canStackWithPromotions?: (coupon: Coupon) => boolean
  ): CouponCalculation[] {
    const allCalculations = this.getAvailableCoupons(couponWallet, items, currentTime, member, orderStoreId);
    let applicable = allCalculations.filter(c => c.applicable);

    if (canStackWithPromotions) {
      applicable = applicable.filter(c => canStackWithPromotions(c.coupon));
    }

    if (applicable.length === 0) {
      return [];
    }

    const subsets = this.generateSubsets(applicable);
    let bestCombination: CouponCalculation[] = [];
    let bestDiscount = 0;

    for (const subset of subsets) {
      if (this.isCombinationValid(subset)) {
        const totalDiscount = subset.reduce((sum, c) => sum + c.discountAmount, 0);
        if (totalDiscount > bestDiscount) {
          bestDiscount = totalDiscount;
          bestCombination = subset;
        }
      }
    }

    const selectedIds = bestCombination.map(c => c.couponId);
    const skipped: CouponCalculation[] = [];

    for (const calc of applicable) {
      if (!selectedIds.includes(calc.couponId)) {
        const conflictingWith = bestCombination.filter(selected =>
          !this.areCouponsStackable(calc.coupon, selected.coupon)
        ).map(c => c.couponName);

        skipped.push({
          ...calc,
          applicable: false,
          unavailabilityReason: conflictingWith.length > 0
            ? `与已选券互斥：${conflictingWith.join('、')}`
            : '未选入最优组合',
          unavailabilityReasonCode: conflictingWith.length > 0 ? 'EXCLUDED_BY_OTHER' : 'NOT_IN_BEST_COMBINATION',
          excludedBy: conflictingWith.length > 0 ? bestCombination.filter(c => !this.areCouponsStackable(calc.coupon, c.coupon)).map(c => c.couponId) : undefined
        });
      }
    }

    return [...bestCombination, ...skipped];
  }

  getSelectedCouponsWithExclusionCheck(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member,
    orderStoreId?: string
  ): CouponCalculation[] {
    if (!couponWallet.selectedCouponIds || couponWallet.selectedCouponIds.length === 0) {
      return [];
    }

    const selectedCoupons = couponWallet.coupons.filter(c => couponWallet.selectedCouponIds!.includes(c.id));
    const calculations = selectedCoupons.map(coupon =>
      this.calculateCouponDiscount(coupon, items, currentTime, member, orderStoreId)
    );

    const applicable = calculations.filter(c => c.applicable);
    const result: CouponCalculation[] = [];
    const applied: CouponCalculation[] = [];

    for (const calc of calculations) {
      if (!calc.applicable) {
        result.push(calc);
        continue;
      }

      let canUse = true;
      const conflictingIds: string[] = [];

      for (const appliedCalc of applied) {
        if (!this.areCouponsStackable(calc.coupon, appliedCalc.coupon)) {
          canUse = false;
          conflictingIds.push(appliedCalc.couponId);
        }
      }

      if (canUse) {
        result.push(calc);
        applied.push(calc);
      } else {
        result.push({
          ...calc,
          applicable: false,
          unavailabilityReason: `与已选券互斥：${conflictingIds.map(id => calculations.find(c => c.couponId === id)?.couponName || id).join('、')}`,
          unavailabilityReasonCode: 'EXCLUDED_BY_OTHER',
          excludedBy: conflictingIds
        });
      }
    }

    return result;
  }

  processCouponWallet(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member,
    orderStoreId?: string,
    canStackWithPromotions?: (coupon: Coupon) => boolean
  ): { applied: CouponCalculation[]; unavailable: CouponCalculation[] } {
    const mode = couponWallet.selectionMode || 'auto';
    let results: CouponCalculation[];

    if (mode === 'manual' && couponWallet.selectedCouponIds && couponWallet.selectedCouponIds.length > 0) {
      results = this.getSelectedCouponsWithExclusionCheck(couponWallet, items, currentTime, member, orderStoreId);
    } else {
      results = this.getBestCouponCombination(couponWallet, items, currentTime, member, orderStoreId, canStackWithPromotions);
    }

    const applied = results.filter(r => r.applicable);
    const unavailable = results.filter(r => !r.applicable);

    const allIds = couponWallet.coupons.map(c => c.id);
    const processedIds = results.map(r => r.couponId);
    const missingIds = allIds.filter(id => !processedIds.includes(id));

    for (const missingId of missingIds) {
      const coupon = couponWallet.coupons.find(c => c.id === missingId)!;
      const calc = this.calculateCouponDiscount(coupon, items, currentTime, member, orderStoreId);
      if (!calc.applicable) {
        unavailable.push(calc);
      }
    }

    return { applied, unavailable };
  }
}
