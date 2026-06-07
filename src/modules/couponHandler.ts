import { Coupon, CouponWallet, CartItem, Member } from '../types';
import { isProductInScope, isInAnyTimeRange, roundToTwo, calculateItemTotal } from '../utils';
import { MatchResult } from './productMatcher';

export interface CouponCalculation {
  couponId: string;
  couponName: string;
  applicable: boolean;
  discountAmount: number;
  affectedItems: string[];
  unavailabilityReason?: string;
}

export class CouponHandler {
  calculateCouponDiscount(
    coupon: Coupon,
    items: CartItem[],
    currentTime: string,
    member?: Member
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
        unavailabilityReason: '优惠券已过期'
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
          unavailabilityReason: '优惠券已被领取完'
        };
      }
    }

    const matchedItems = items.filter(item => {
      if (!isProductInScope(item, coupon.scope)) {
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
        unavailabilityReason: `金额未达到优惠券使用门槛，当前 ${matchedAmount.toFixed(2)} 元，需满 ${coupon.scope.minAmount} 元`
      };
    }

    if (coupon.scope.minQuantity && matchedQuantity < coupon.scope.minQuantity) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        unavailabilityReason: `数量未达到优惠券使用门槛，当前 ${matchedQuantity} 件，需满 ${coupon.scope.minQuantity} 件`
      };
    }

    if (matchedAmount < coupon.threshold) {
      return {
        couponId: coupon.id,
        couponName: coupon.name,
        applicable: false,
        discountAmount: 0,
        affectedItems: [],
        unavailabilityReason: `金额未达到优惠券门槛，当前 ${matchedAmount.toFixed(2)} 元，需满 ${coupon.threshold} 元`
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

    return {
      couponId: coupon.id,
      couponName: coupon.name,
      applicable: true,
      discountAmount: roundToTwo(discountAmount),
      affectedItems: matchedItems.map(item => item.lineId)
    };
  }

  getAvailableCoupons(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member
  ): CouponCalculation[] {
    return couponWallet.coupons.map(coupon =>
      this.calculateCouponDiscount(coupon, items, currentTime, member)
    );
  }

  getBestCoupon(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member
  ): CouponCalculation | null {
    const availableCoupons = this.getAvailableCoupons(couponWallet, items, currentTime, member)
      .filter(c => c.applicable)
      .sort((a, b) => b.discountAmount - a.discountAmount);

    return availableCoupons.length > 0 ? availableCoupons[0] : null;
  }

  getSelectedCoupons(
    couponWallet: CouponWallet,
    items: CartItem[],
    currentTime: string,
    member?: Member
  ): CouponCalculation[] {
    if (!couponWallet.selectedCouponIds || couponWallet.selectedCouponIds.length === 0) {
      return [];
    }

    return couponWallet.coupons
      .filter(c => couponWallet.selectedCouponIds!.includes(c.id))
      .map(coupon => this.calculateCouponDiscount(coupon, items, currentTime, member));
  }
}
