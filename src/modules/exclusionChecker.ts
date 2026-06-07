import { Promotion, PromotionConflict, ValidationResult, Coupon } from '../types';

export class ExclusionChecker {
  checkPromotionConflicts(promotions: Promotion[]): PromotionConflict[] {
    const conflicts: PromotionConflict[] = [];

    for (let i = 0; i < promotions.length; i++) {
      for (let j = i + 1; j < promotions.length; j++) {
        const p1 = promotions[i];
        const p2 = promotions[j];

        const conflict = this.checkPairConflict(p1, p2);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  checkPairConflict(p1: Promotion, p2: Promotion): PromotionConflict | null {
    if (p1.exclusiveWith?.includes(p2.id) || p2.exclusiveWith?.includes(p1.id)) {
      return {
        promotionIds: [p1.id, p2.id],
        type: 'exclusion',
        description: `活动「${p1.name}」与「${p2.name}」互斥，不能同时使用`
      };
    }

    if (p1.exclusionType === 'mutual_exclusive' || p2.exclusionType === 'mutual_exclusive') {
      if (this.hasScopeOverlap(p1, p2) && this.hasTimeOverlap(p1, p2)) {
        return {
          promotionIds: [p1.id, p2.id],
          type: 'exclusion',
          description: `活动「${p1.name}」与「${p2.name}」适用范围和时间重叠，且为互斥类型，不能同时使用`
        };
      }
    }

    return null;
  }

  private hasScopeOverlap(p1: Promotion, p2: Promotion): boolean {
    const s1 = p1.scope;
    const s2 = p2.scope;

    if (s1.productIds && s2.productIds) {
      const overlap = s1.productIds.some(id => s2.productIds!.includes(id));
      if (overlap) return true;
    }

    if (s1.categoryIds && s2.categoryIds) {
      const overlap = s1.categoryIds.some(id => s2.categoryIds!.includes(id));
      if (overlap) return true;
    }

    if (s1.brandIds && s2.brandIds) {
      const overlap = s1.brandIds.some(id => s2.brandIds!.includes(id));
      if (overlap) return true;
    }

    if (!s1.productIds && !s1.categoryIds && !s1.brandIds &&
        !s2.productIds && !s2.categoryIds && !s2.brandIds) {
      return true;
    }

    if ((!s1.productIds && !s1.categoryIds && !s1.brandIds) ||
        (!s2.productIds && !s2.categoryIds && !s2.brandIds)) {
      return true;
    }

    return false;
  }

  private hasTimeOverlap(p1: Promotion, p2: Promotion): boolean {
    const start1 = new Date(p1.startTime).getTime();
    const end1 = new Date(p1.endTime).getTime();
    const start2 = new Date(p2.startTime).getTime();
    const end2 = new Date(p2.endTime).getTime();

    return start1 < end2 && start2 < end1;
  }

  canApplyTogether(p1: Promotion, p2: Promotion): boolean {
    if (p1.stackableWith?.includes(p2.id) || p2.stackableWith?.includes(p1.id)) {
      return true;
    }

    if (p1.exclusiveWith?.includes(p2.id) || p2.exclusiveWith?.includes(p1.id)) {
      return false;
    }

    if (p1.exclusionType === 'stackable' && p2.exclusionType === 'stackable') {
      return true;
    }

    if (p1.exclusionType === 'mutual_exclusive' || p2.exclusionType === 'mutual_exclusive') {
      return false;
    }

    if (p1.exclusionType === 'override' || p2.exclusionType === 'override') {
      return false;
    }

    return true;
  }

  canCouponStackWithPromotions(coupon: Coupon, promotions: Promotion[]): boolean {
    if (coupon.stackableWithPromotions === false) {
      return false;
    }

    if (coupon.exclusiveWith && coupon.exclusiveWith.length > 0) {
      const hasExclusivePromotion = promotions.some(p => coupon.exclusiveWith!.includes(p.id));
      if (hasExclusivePromotion) {
        return false;
      }
    }

    return true;
  }

  selectOptimalPromotions(
    promotions: Promotion[],
    discountMap: Map<string, number>
  ): string[] {
    const sortedPromotions = [...promotions].sort((a, b) => {
      const discountA = discountMap.get(a.id) || 0;
      const discountB = discountMap.get(b.id) || 0;
      if (discountB !== discountA) {
        return discountB - discountA;
      }
      return b.priority - a.priority;
    });

    const selected: string[] = [];
    const selectedPromotions: Promotion[] = [];

    for (const promotion of sortedPromotions) {
      const canAdd = selectedPromotions.every(p => this.canApplyTogether(p, promotion));
      if (canAdd) {
        selected.push(promotion.id);
        selectedPromotions.push(promotion);
      }
    }

    return selected;
  }

  validatePromotions(promotions: Promotion[]): ValidationResult {
    const conflicts = this.checkPromotionConflicts(promotions);
    const warnings: string[] = [];

    promotions.forEach(p => {
      if (new Date(p.startTime) >= new Date(p.endTime)) {
        warnings.push(`活动「${p.name}」的开始时间晚于或等于结束时间`);
      }
      if (p.priority < 0) {
        warnings.push(`活动「${p.name}」的优先级为负数`);
      }
    });

    return {
      valid: conflicts.length === 0,
      conflicts,
      warnings
    };
  }
}
