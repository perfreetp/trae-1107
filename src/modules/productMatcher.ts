import { Product, Promotion, PromotionScope, CartItem } from '../types';
import { isProductInScope, calculateItemTotal, isInAnyTimeRange } from '../utils';

export type MatchStatus =
  | 'matched'
  | 'disabled'
  | 'not_started'
  | 'expired'
  | 'not_in_time_range'
  | 'not_in_store'
  | 'not_in_scope';

export interface MatchResult {
  matchedItems: CartItem[];
  matchedAmount: number;
  matchedQuantity: number;
  status: MatchStatus;
  statusReason?: string;
}

export class ProductMatcher {
  matchProductsForPromotion(
    items: CartItem[],
    promotion: Promotion,
    currentTime: string,
    orderStoreId?: string
  ): MatchResult {
    if (!promotion.enabled) {
      return {
        matchedItems: [],
        matchedAmount: 0,
        matchedQuantity: 0,
        status: 'disabled',
        statusReason: '活动未启用'
      };
    }

    const now = new Date(currentTime);
    const startTime = new Date(promotion.startTime);
    const endTime = new Date(promotion.endTime);

    if (now < startTime) {
      return {
        matchedItems: [],
        matchedAmount: 0,
        matchedQuantity: 0,
        status: 'not_started',
        statusReason: `活动未开始，开始时间：${promotion.startTime}`
      };
    }

    if (now > endTime) {
      return {
        matchedItems: [],
        matchedAmount: 0,
        matchedQuantity: 0,
        status: 'expired',
        statusReason: `活动已过期，结束时间：${promotion.endTime}`
      };
    }

    const scope = promotion.scope;

    if (scope.storeIds && scope.storeIds.length > 0) {
      const anyItemHasStore = items.some(item => item.storeId);
      const effectiveStoreId = anyItemHasStore ? undefined : orderStoreId;
      if (effectiveStoreId && !scope.storeIds.includes(effectiveStoreId)) {
        return {
          matchedItems: [],
          matchedAmount: 0,
          matchedQuantity: 0,
          status: 'not_in_store',
          statusReason: `当前门店不参与此活动，适用门店：${scope.storeIds.join('、')}`
        };
      }
    }

    const matchedItems = items.filter(item => {
      if (!isProductInScope(item, scope, orderStoreId)) {
        return false;
      }

      if (scope.timeRanges && scope.timeRanges.length > 0) {
        if (!isInAnyTimeRange(scope.timeRanges, currentTime)) {
          return false;
        }
      }

      return true;
    });

    if (matchedItems.length === 0) {
      if (scope.timeRanges && scope.timeRanges.length > 0) {
        const timeMatch = items.some(item => {
          return isProductInScope(item, scope, orderStoreId);
        });
        if (timeMatch) {
          return {
            matchedItems: [],
            matchedAmount: 0,
            matchedQuantity: 0,
            status: 'not_in_time_range',
            statusReason: '当前时段不在活动有效时间内'
          };
        }
      }
    }

    const matchedAmount = matchedItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const matchedQuantity = matchedItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      matchedItems,
      matchedAmount,
      matchedQuantity,
      status: matchedItems.length > 0 ? 'matched' : 'not_in_scope',
      statusReason: matchedItems.length > 0 ? undefined : '购物车中没有符合活动范围的商品'
    };
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
