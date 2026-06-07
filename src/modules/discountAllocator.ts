import { CartItem, DiscountShareDetail, PromotionType } from '../types';
import { roundToTwo, calculateItemTotal } from '../utils';

export interface AllocationRequest {
  items: CartItem[];
  totalDiscount: number;
  affectedItemIds: string[];
  promotionId: string;
  promotionName: string;
  promotionType: PromotionType;
  unitDiscounts?: { lineId: string; unitDiscount: number; discountedQuantity?: number }[];
}

export class DiscountAllocator {
  allocateDiscount(request: AllocationRequest): CartItem[] {
    const { items, totalDiscount, affectedItemIds, promotionId, promotionName, promotionType, unitDiscounts } = request;

    if (totalDiscount <= 0 || affectedItemIds.length === 0) {
      return items;
    }

    const affectedItems = items.filter(item => affectedItemIds.includes(item.lineId));
    const affectedRemainingTotal = affectedItems.reduce((sum, item) => sum + Math.max(0, (item.finalPrice || calculateItemTotal(item))), 0);

    if (affectedRemainingTotal <= 0) {
      return items;
    }

    const actualTotalDiscount = Math.min(totalDiscount, affectedRemainingTotal);

    const remainingItems = items.filter(item => !affectedItemIds.includes(item.lineId));
    const allocatedItems: CartItem[] = [];

    let remainingDiscount = actualTotalDiscount;

    for (let i = 0; i < affectedItems.length; i++) {
      const item = affectedItems[i];
      const itemRemaining = Math.max(0, (item.finalPrice || calculateItemTotal(item)));
      const itemTotal = calculateItemTotal(item);

      if (itemRemaining <= 0) {
        allocatedItems.push(item);
        continue;
      }

      let itemDiscount = 0;

      if (unitDiscounts && unitDiscounts.length > 0) {
        const unitDiscount = unitDiscounts.find(u => u.lineId === item.lineId);
        if (unitDiscount) {
          const quantity = unitDiscount.discountedQuantity !== undefined ? unitDiscount.discountedQuantity : item.quantity;
          itemDiscount = roundToTwo(unitDiscount.unitDiscount * quantity);
        }
      } else {
        const ratio = itemRemaining / affectedRemainingTotal;
        if (i === affectedItems.length - 1) {
          itemDiscount = roundToTwo(remainingDiscount);
        } else {
          itemDiscount = roundToTwo(actualTotalDiscount * ratio);
          remainingDiscount = roundToTwo(remainingDiscount - itemDiscount);
        }
      }

      itemDiscount = Math.min(itemDiscount, itemRemaining);

      const shareDetail: DiscountShareDetail = {
        promotionId,
        promotionName,
        promotionType,
        discountAmount: itemDiscount
      };

      const newShareDetail = item.shareDetail ? [...item.shareDetail, shareDetail] : [shareDetail];

      const newAppliedDiscount = roundToTwo((item.appliedDiscount || 0) + itemDiscount);
      const newFinalPrice = roundToTwo(Math.max(0, itemTotal - newAppliedDiscount));
      const newPromotionIds = item.promotionIds ? [...item.promotionIds, promotionId] : [promotionId];

      allocatedItems.push({
        ...item,
        appliedDiscount: newAppliedDiscount,
        finalPrice: newFinalPrice,
        promotionIds: newPromotionIds,
        shareDetail: newShareDetail
      });
    }

    return [...allocatedItems, ...remainingItems];
  }

  allocateMultipleDiscounts(
    items: CartItem[],
    allocations: Omit<AllocationRequest, 'items'>[]
  ): CartItem[] {
    let result = [...items];

    for (const allocation of allocations) {
      result = this.allocateDiscount({
        items: result,
        ...allocation
      });
    }

    return result;
  }

  initializeItems(items: CartItem[]): CartItem[] {
    return items.map(item => ({
      ...item,
      appliedDiscount: item.appliedDiscount || 0,
      finalPrice: item.finalPrice || calculateItemTotal(item),
      promotionIds: item.promotionIds || [],
      shareDetail: item.shareDetail || []
    }));
  }

  validateAllocation(items: CartItem[], expectedTotalDiscount: number): boolean {
    const actualDiscount = items.reduce((sum, item) => sum + (item.appliedDiscount || 0), 0);
    return Math.abs(actualDiscount - expectedTotalDiscount) < 0.01;
  }
}
