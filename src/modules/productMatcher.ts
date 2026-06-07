import { Product, Promotion, PromotionScope, CartItem } from '../types';
import { isProductInScope, calculateItemTotal, isInAnyTimeRange } from '../utils';

export interface MatchResult {
  matchedItems: CartItem[];
  matchedAmount: number;
  matchedQuantity: number;
}

export class ProductMatcher {
  matchProductsForPromotion(
    items: CartItem[],
    promotion: Promotion,
    currentTime: string
  ): MatchResult {
    if (!promotion.enabled) {
      return { matchedItems: [], matchedAmount: 0, matchedQuantity: 0 };
    }

    const now = new Date(currentTime);
    const startTime = new Date(promotion.startTime);
    const endTime = new Date(promotion.endTime);

    if (now < startTime || now > endTime) {
      return { matchedItems: [], matchedAmount: 0, matchedQuantity: 0 };
    }

    const scope = promotion.scope;

    const matchedItems = items.filter(item => {
      if (!isProductInScope(item, scope)) {
        return false;
      }

      if (scope.timeRanges && scope.timeRanges.length > 0) {
        if (!isInAnyTimeRange(scope.timeRanges, currentTime)) {
          return false;
        }
      }

      return true;
    });

    const matchedAmount = matchedItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const matchedQuantity = matchedItems.reduce((sum, item) => sum + item.quantity, 0);

    return { matchedItems, matchedAmount, matchedQuantity };
  }

  checkMinRequirements(
    matchResult: MatchResult,
    scope: PromotionScope
  ): { valid: boolean; reason?: string } {
    if (scope.minAmount && matchResult.matchedAmount < scope.minAmount) {
      return {
        valid: false,
        reason: `金额未达到最低要求，当前 ${matchResult.matchedAmount.toFixed(2)} 元，需满 ${scope.minAmount} 元`
      };
    }

    if (scope.minQuantity && matchResult.matchedQuantity < scope.minQuantity) {
      return {
        valid: false,
        reason: `数量未达到最低要求，当前 ${matchResult.matchedQuantity} 件，需满 ${scope.minQuantity} 件`
      };
    }

    return { valid: true };
  }

  matchProductBySku(items: CartItem[], skuIds: string[]): CartItem[] {
    return items.filter(item => skuIds.includes(item.skuId));
  }

  matchProductByCategory(items: CartItem[], categoryIds: string[]): CartItem[] {
    return items.filter(item => {
      const categories = item.categoryPath || (item.categoryId ? [item.categoryId] : []);
      return categories.some(cat => categoryIds.includes(cat));
    });
  }

  matchProductByBrand(items: CartItem[], brandIds: string[]): CartItem[] {
    return items.filter(item => item.brandId && brandIds.includes(item.brandId));
  }
}
