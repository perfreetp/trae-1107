import { TimeRange, Product, PromotionScope } from '../types';

export function isInTimeRange(timeRange: TimeRange, currentTime: string): boolean {
  const now = new Date(currentTime);
  const start = new Date(timeRange.start);
  const end = new Date(timeRange.end);

  if (now < start || now > end) {
    return false;
  }

  if (timeRange.weekdays && timeRange.weekdays.length > 0) {
    const weekday = now.getDay();
    return timeRange.weekdays.includes(weekday);
  }

  return true;
}

export function isInAnyTimeRange(timeRanges: TimeRange[], currentTime: string): boolean {
  if (!timeRanges || timeRanges.length === 0) {
    return true;
  }
  return timeRanges.some(range => isInTimeRange(range, currentTime));
}

export function isProductInScope(product: Product, scope: PromotionScope): boolean {
  if (scope.excludeProductIds?.includes(product.skuId)) {
    return false;
  }

  if (scope.productIds && scope.productIds.length > 0) {
    if (!scope.productIds.includes(product.skuId)) {
      return false;
    }
  }

  if (scope.spuIds && scope.spuIds.length > 0) {
    if (!product.spuId || !scope.spuIds.includes(product.spuId)) {
      return false;
    }
  }

  if (scope.categoryIds && scope.categoryIds.length > 0) {
    const categories = product.categoryPath || (product.categoryId ? [product.categoryId] : []);
    const hasCategory = categories.some(cat => scope.categoryIds!.includes(cat));
    if (!hasCategory) {
      return false;
    }
  }

  if (scope.brandIds && scope.brandIds.length > 0) {
    if (!product.brandId || !scope.brandIds.includes(product.brandId)) {
      return false;
    }
  }

  if (scope.storeIds && scope.storeIds.length > 0) {
    if (!product.storeId || !scope.storeIds.includes(product.storeId)) {
      return false;
    }
  }

  if (scope.excludeStoreIds?.includes(product.storeId || '')) {
    return false;
  }

  return true;
}

export function calculateItemTotal(product: Product): number {
  return product.price * product.quantity;
}

export function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}

export function generateLineId(): string {
  return 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
