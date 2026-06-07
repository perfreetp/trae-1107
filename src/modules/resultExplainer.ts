import { Promotion, PromotionResult, UnavailablePromotion, PromotionType, Coupon } from '../types';

const PROMOTION_TYPE_NAMES: Record<PromotionType, string> = {
  full_reduction: '满减',
  full_discount: '满折',
  second_item: '第二件优惠',
  combo_price: '组合价',
  member_price: '会员专享价',
  birthday_discount: '生日折扣',
  step_gift: '阶梯赠品',
  coupon: '优惠券'
};

export class ResultExplainer {
  generateHitReason(promotion: Promotion): string {
    const rule = promotion.rule;
    const typeName = PROMOTION_TYPE_NAMES[promotion.type];

    switch (rule.type) {
      case 'full_reduction':
        return `满足满${rule.threshold}元减${rule.discountAmount}元条件`;
      case 'full_discount':
        return `满足满${rule.threshold}元打${(rule.discountRate * 10).toFixed(1)}折条件`;
      case 'second_item':
        if (rule.discountType === 'free') {
          return `满足买${rule.buyCount}送${rule.giftCount}条件`;
        } else if (rule.discountType === 'discount') {
          return `满足买${rule.buyCount}件，第${rule.buyCount + 1}件${(rule.discountRate! * 10).toFixed(1)}折条件`;
        } else {
          return `满足买${rule.buyCount}件，第${rule.buyCount + 1}件${rule.fixedPrice}元条件`;
        }
      case 'combo_price':
        return `满足组合购买条件，组合价${rule.comboPrice}元`;
      case 'member_price':
        return `会员专享价${rule.memberPrice}元`;
      case 'birthday_discount':
        return `生日专享${(rule.discountRate * 10).toFixed(1)}折优惠`;
      case 'step_gift':
        return `满足赠品条件，已为您添加赠品`;
      default:
        return `满足${typeName}活动条件`;
    }
  }

  generateDisplayText(promotion: Promotion, discountAmount: number): string {
    if (promotion.displayText) {
      return promotion.displayText;
    }

    const rule = promotion.rule;

    switch (rule.type) {
      case 'full_reduction':
        if (rule.isCycle) {
          return `满${rule.threshold}减${rule.discountAmount}，循环优惠已减${discountAmount}元`;
        }
        return `满${rule.threshold}减${rule.discountAmount}，已减${discountAmount}元`;
      case 'full_discount':
        return `满${rule.threshold}打${(rule.discountRate * 10).toFixed(1)}折，已减${discountAmount}元`;
      case 'second_item':
        if (rule.discountType === 'free') {
          return `买${rule.buyCount}送${rule.giftCount}，已优惠${discountAmount}元`;
        } else if (rule.discountType === 'discount') {
          return `第${rule.buyCount + 1}件${(rule.discountRate! * 10).toFixed(1)}折，已优惠${discountAmount}元`;
        } else {
          return `第${rule.buyCount + 1}件${rule.fixedPrice}元，已优惠${discountAmount}元`;
        }
      case 'combo_price':
        return `组合价${rule.comboPrice}元，已省${discountAmount}元`;
      case 'member_price':
        return `会员专享价，已省${discountAmount}元`;
      case 'birthday_discount':
        return `生日专享${(rule.discountRate * 10).toFixed(1)}折，已省${discountAmount}元`;
      case 'step_gift':
        return `已满足赠品条件，获得赠品`;
      default:
        return `${promotion.name}，已优惠${discountAmount}元`;
    }
  }

  generateCouponDisplayText(coupon: Coupon, discountAmount: number): string {
    if (coupon.displayText) {
      return coupon.displayText;
    }

    switch (coupon.type) {
      case 'full_reduction':
        if (coupon.threshold > 0) {
          return `「${coupon.name}」满${coupon.threshold}减${coupon.discountAmount}，已减${discountAmount}元`;
        }
        return `「${coupon.name}」无门槛减${coupon.discountAmount}，已减${discountAmount}元`;
      case 'full_discount':
        if (coupon.threshold > 0) {
          return `「${coupon.name}」满${coupon.threshold}打${(coupon.discountRate! * 10).toFixed(1)}折，已减${discountAmount}元`;
        }
        return `「${coupon.name}」${(coupon.discountRate! * 10).toFixed(1)}折，已减${discountAmount}元`;
      case 'fixed_price':
        return `「${coupon.name}」固定价${coupon.fixedPrice}元，已减${discountAmount}元`;
      default:
        return `「${coupon.name}」已减${discountAmount}元`;
    }
  }

  generateUnavailablePromotion(
    promotion: Promotion,
    reason: string,
    reasonCode: string
  ): UnavailablePromotion {
    return {
      promotionId: promotion.id,
      promotionName: promotion.name,
      reason,
      reasonCode
    };
  }

  generatePromotionResult(
    promotion: Promotion,
    applied: boolean,
    discountAmount: number,
    affectedItems: string[],
    gifts?: any[]
  ): PromotionResult {
    return {
      promotionId: promotion.id,
      promotionName: promotion.name,
      promotionType: promotion.type,
      applied,
      discountAmount,
      hitReason: applied ? this.generateHitReason(promotion) : undefined,
      affectedItems,
      gifts,
      displayText: applied ? this.generateDisplayText(promotion, discountAmount) : undefined
    };
  }

  generateSummaryMessages(
    appliedPromotions: PromotionResult[],
    appliedCoupons: PromotionResult[],
    totalDiscount: number
  ): string[] {
    const messages: string[] = [];

    if (totalDiscount > 0) {
      messages.push(`共优惠 ${totalDiscount.toFixed(2)} 元`);
    }

    appliedPromotions.forEach(p => {
      if (p.displayText) {
        messages.push(p.displayText);
      }
    });

    appliedCoupons.forEach(c => {
      if (c.displayText) {
        messages.push(c.displayText);
      }
    });

    return messages;
  }

  explainUnavailableReason(reasonCode: string): string {
    const reasonMap: Record<string, string> = {
      'NOT_ENABLED': '活动未启用',
      'NOT_STARTED': '活动未开始',
      'EXPIRED': '活动已过期',
      'NOT_IN_TIME_RANGE': '当前时段不在活动有效时间内',
      'NOT_IN_STORE': '该门店不参与此活动',
      'NOT_IN_SCOPE': '购物车中商品不满足活动范围',
      'MIN_AMOUNT_NOT_MET': '未达到活动最低金额要求',
      'MIN_QUANTITY_NOT_MET': '未达到活动最低数量要求',
      'MEMBER_LEVEL_NOT_MET': '会员等级不满足要求',
      'BIRTHDAY_NOT_TODAY': '今天不是您的生日',
      'EXCLUDED_BY_OTHER': '与其他活动互斥',
      'COUPON_EXPIRED': '优惠券已过期',
      'COUPON_USED_UP': '优惠券已被领完',
      'COUPON_THRESHOLD_NOT_MET': '未达到优惠券使用门槛'
    };

    return reasonMap[reasonCode] || '不满足活动条件';
  }
}
