import {
  TrialRequest,
  CalculationResult,
  PromotionResult,
  UnavailablePromotion,
  Promotion,
  GiftItem,
  CartItem,
  ResourceUsage,
  CalculationStepDetail,
  Coupon
} from '../types';
import { ProductMatcher } from './productMatcher';
import { MemberChecker } from './memberChecker';
import { DiscountCalculator, DiscountCalculation } from './discountCalculator';
import { CouponHandler, CouponCalculation } from './couponHandler';
import { ExclusionChecker } from './exclusionChecker';
import { ResultExplainer } from './resultExplainer';
import { DiscountAllocator, AllocationRequest } from './discountAllocator';
import { roundToTwo, calculateItemTotal } from '../utils';

export class TrialCalculator {
  private productMatcher: ProductMatcher;
  private memberChecker: MemberChecker;
  private discountCalculator: DiscountCalculator;
  private couponHandler: CouponHandler;
  private exclusionChecker: ExclusionChecker;
  private resultExplainer: ResultExplainer;
  private discountAllocator: DiscountAllocator;

  constructor() {
    this.productMatcher = new ProductMatcher();
    this.memberChecker = new MemberChecker();
    this.discountCalculator = new DiscountCalculator();
    this.couponHandler = new CouponHandler();
    this.exclusionChecker = new ExclusionChecker();
    this.resultExplainer = new ResultExplainer();
    this.discountAllocator = new DiscountAllocator();
  }

  calculate(request: TrialRequest): CalculationResult {
    const currentTime = request.currentTime || new Date().toISOString();
    const { cart, member, promotions, couponWallet, storeId } = request;
    const orderStoreId = storeId || cart.storeId;

    const originalTotal = cart.totalAmount;

    let items = this.discountAllocator.initializeItems([...cart.items]);
    const itemBaseAmounts = new Map<string, number>();
    items.forEach(item => itemBaseAmounts.set(item.lineId, calculateItemTotal(item)));

    const enabledPromotions = promotions.filter(p => p.enabled);

    const promotionResults: Map<string, {
      promotion: Promotion;
      matchResult: any;
      discountCalc: DiscountCalculation;
      memberEligible: boolean;
      minReqValid: boolean;
    }> = new Map();

    const unavailablePromotions: UnavailablePromotion[] = [];
    const resourceUsages: ResourceUsage[] = [];
    const calculationSteps: CalculationStepDetail[] = [];

    for (const promotion of enabledPromotions) {
      const matchResult = this.productMatcher.matchProductsForPromotion(items, promotion, currentTime, orderStoreId);

      if (matchResult.matchedItems.length === 0) {
        let reasonCode = 'NOT_IN_SCOPE';
        let reason = '购物车中没有符合活动范围的商品';

        switch (matchResult.status) {
          case 'disabled':
            reasonCode = 'NOT_ENABLED';
            reason = matchResult.statusReason || '活动未启用';
            break;
          case 'not_started':
            reasonCode = 'NOT_STARTED';
            reason = matchResult.statusReason || '活动未开始';
            break;
          case 'expired':
            reasonCode = 'EXPIRED';
            reason = matchResult.statusReason || '活动已过期';
            break;
          case 'not_in_time_range':
            reasonCode = 'NOT_IN_TIME_RANGE';
            reason = matchResult.statusReason || '当前时段不在活动有效时间内';
            break;
          case 'not_in_store':
            reasonCode = 'NOT_IN_STORE';
            reason = matchResult.statusReason || '当前门店不参与此活动';
            break;
          case 'not_in_scope':
          default:
            reason = matchResult.statusReason || '购物车中没有符合活动范围的商品';
            break;
        }

        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            promotion,
            reason,
            reasonCode
          )
        );
        continue;
      }

      const memberEligible = this.memberChecker.isMemberEligible(member, promotion.scope);
      if (!memberEligible.eligible) {
        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            promotion,
            memberEligible.reason || '会员等级不满足要求',
            'MEMBER_LEVEL_NOT_MET'
          )
        );
        continue;
      }

      if (promotion.type === 'birthday_discount') {
        const birthdayEligible = this.memberChecker.checkBirthdayDiscountEligible(
          member,
          currentTime,
          (promotion.rule as any).requiredLevels
        );
        if (!birthdayEligible.eligible) {
          unavailablePromotions.push(
            this.resultExplainer.generateUnavailablePromotion(
              promotion,
              birthdayEligible.reason || '不满足生日折扣条件',
              'BIRTHDAY_NOT_TODAY'
            )
          );
          continue;
        }
      }

      const minReqCheck = this.productMatcher.checkMinRequirements(matchResult, promotion.scope);
      if (!minReqCheck.valid) {
        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            promotion,
            minReqCheck.reason || '未达到活动门槛',
            minReqCheck.reason?.includes('金额') ? 'MIN_AMOUNT_NOT_MET' : 'MIN_QUANTITY_NOT_MET'
          )
        );
        continue;
      }

      const discountCalc = this.discountCalculator.calculate(promotion, matchResult, member);

      if (discountCalc.discountAmount <= 0 && (!discountCalc.gifts || discountCalc.gifts.length === 0)) {
        continue;
      }

      const resourceCheck = this.discountCalculator.checkResourceLimits(promotion, discountCalc.discountAmount);
      if (!resourceCheck.valid) {
        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            promotion,
            resourceCheck.reason || '资源不足',
            resourceCheck.reasonCode || 'RESOURCE_LIMIT'
          )
        );
        continue;
      }

      promotionResults.set(promotion.id, {
        promotion,
        matchResult,
        discountCalc,
        memberEligible: true,
        minReqValid: true
      });
    }

    const discountMap = new Map<string, number>();
    promotionResults.forEach((value, key) => {
      discountMap.set(key, value.discountCalc.discountAmount);
    });

    const eligiblePromotions = Array.from(promotionResults.values()).map(v => v.promotion);
    const optimalPromotionIds = this.exclusionChecker.selectOptimalPromotions(eligiblePromotions, discountMap);

    const appliedPromotions: PromotionResult[] = [];
    const allocationRequests: Omit<AllocationRequest, 'items'>[] = [];
    const allGifts: GiftItem[] = [];

    for (const promoId of optimalPromotionIds) {
      const result = promotionResults.get(promoId);
      if (!result) continue;

      const { promotion, discountCalc, matchResult } = result;

      appliedPromotions.push(
        this.resultExplainer.generatePromotionResult(
          promotion,
          true,
          discountCalc.discountAmount,
          discountCalc.affectedItems,
          discountCalc.gifts
        )
      );

      if (discountCalc.discountAmount > 0) {
        allocationRequests.push({
          totalDiscount: discountCalc.discountAmount,
          affectedItemIds: discountCalc.affectedItems,
          promotionId: promotion.id,
          promotionName: promotion.name,
          promotionType: promotion.type,
          unitDiscounts: discountCalc.unitDiscounts
        });
      }

      if (discountCalc.gifts) {
        allGifts.push(...discountCalc.gifts);
      }

      resourceUsages.push(this.discountCalculator.calculateResourceUsage(promotion, discountCalc.discountAmount));

      const stepDetail: CalculationStepDetail = {
        id: promotion.id,
        name: promotion.name,
        type: 'promotion',
        promotionType: promotion.type,
        baseAmount: matchResult.matchedAmount,
        discountAmount: discountCalc.discountAmount,
        affectedItems: matchResult.matchedItems.map((item: CartItem) => ({
          lineId: item.lineId,
          skuId: item.skuId,
          name: item.name,
          baseAmount: calculateItemTotal(item),
          shareAmount: 0,
          finalAmount: calculateItemTotal(item)
        }))
      };
      calculationSteps.push(stepDetail);
    }

    promotionResults.forEach((value, key) => {
      if (!optimalPromotionIds.includes(key)) {
        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            value.promotion,
            '与其他已选择的活动互斥',
            'EXCLUDED_BY_OTHER'
          )
        );
      }
    });

    const canCouponStack = (coupon: Coupon): boolean => {
      const appliedPromotionsList = optimalPromotionIds.map(id => promotions.find(p => p.id === id)!).filter(Boolean);
      return this.exclusionChecker.canCouponStackWithPromotions(coupon, appliedPromotionsList);
    };

    const appliedCoupons: PromotionResult[] = [];
    const unavailableCoupons: UnavailablePromotion[] = [];

    if (couponWallet && couponWallet.coupons.length > 0) {
      const { applied, unavailable } = this.couponHandler.processCouponWallet(
        couponWallet,
        items,
        currentTime,
        member,
        orderStoreId,
        canCouponStack
      );

      for (const couponCalc of applied) {
        appliedCoupons.push({
          promotionId: couponCalc.couponId,
          promotionName: couponCalc.couponName,
          promotionType: 'coupon',
          applied: true,
          discountAmount: couponCalc.discountAmount,
          hitReason: '满足优惠券使用条件',
          affectedItems: couponCalc.affectedItems,
          displayText: this.resultExplainer.generateCouponDisplayText(
            couponCalc.coupon,
            couponCalc.discountAmount
          )
        });

        allocationRequests.push({
          totalDiscount: couponCalc.discountAmount,
          affectedItemIds: couponCalc.affectedItems,
          promotionId: couponCalc.couponId,
          promotionName: couponCalc.couponName,
          promotionType: 'coupon'
        });

        resourceUsages.push(this.couponHandler.calculateResourceUsage(couponCalc.coupon, couponCalc.discountAmount));

        const stepDetail: CalculationStepDetail = {
          id: couponCalc.couponId,
          name: couponCalc.couponName,
          type: 'coupon',
          baseAmount: couponCalc.matchedAmount,
          discountAmount: couponCalc.discountAmount,
          affectedItems: couponCalc.matchedItems.map(item => ({
            lineId: item.lineId,
            skuId: item.skuId,
            name: item.name,
            baseAmount: 0,
            shareAmount: 0,
            finalAmount: 0
          }))
        };
        calculationSteps.push(stepDetail);
      }

      for (const couponCalc of unavailable) {
        unavailableCoupons.push({
          promotionId: couponCalc.couponId,
          promotionName: couponCalc.couponName,
          reason: couponCalc.unavailabilityReason || '优惠券不可用',
          reasonCode: couponCalc.unavailabilityReasonCode || 'COUPON_NOT_APPLICABLE'
        });
      }
    }

    const stepItemAmounts = new Map<string, Map<string, number>>();
    items.forEach(item => {
      const stepMap = new Map<string, number>();
      stepMap.set('start', calculateItemTotal(item));
      stepItemAmounts.set(item.lineId, stepMap);
    });

    for (let i = 0; i < calculationSteps.length; i++) {
      const step = calculationSteps[i];
      const stepAlloc = allocationRequests.find(a => a.promotionId === step.id);
      
      for (const affectedItem of step.affectedItems) {
        const stepMap = stepItemAmounts.get(affectedItem.lineId);
        if (stepMap) {
          const prevAmount = stepMap.get(`step_${i - 1}`) || stepMap.get('start') || 0;
          affectedItem.baseAmount = roundToTwo(prevAmount);
        }
      }

      if (stepAlloc) {
        const stepItems = this.discountAllocator.allocateDiscount({
          items: items.map(item => ({ ...item })),
          ...stepAlloc
        });

        let totalShareForStep = 0;
        for (const affectedItem of step.affectedItems) {
          const stepItem = stepItems.find(i => i.lineId === affectedItem.lineId);
          const origItem = items.find(i => i.lineId === affectedItem.lineId);
          if (stepItem && origItem) {
            const share = stepItem.appliedDiscount! - (origItem.appliedDiscount || 0);
            affectedItem.shareAmount = roundToTwo(Math.max(0, share));
            totalShareForStep += affectedItem.shareAmount;
          }
          affectedItem.finalAmount = roundToTwo(Math.max(0, affectedItem.baseAmount - affectedItem.shareAmount));
        }

        step.roundingDiff = roundToTwo(step.discountAmount - totalShareForStep);
        if (Math.abs(step.roundingDiff) > 0.001 && step.affectedItems.length > 0) {
          const lastItem = step.affectedItems[step.affectedItems.length - 1];
          lastItem.roundingDiff = step.roundingDiff;
          lastItem.shareAmount = roundToTwo(lastItem.shareAmount + step.roundingDiff);
          lastItem.finalAmount = roundToTwo(Math.max(0, lastItem.baseAmount - lastItem.shareAmount));
        }
      }

      for (const affectedItem of step.affectedItems) {
        const stepMap = stepItemAmounts.get(affectedItem.lineId);
        if (stepMap) {
          stepMap.set(`step_${i}`, affectedItem.finalAmount);
        }
      }
    }

    items = this.discountAllocator.allocateMultipleDiscounts(items, allocationRequests);

    for (let i = 0; i < calculationSteps.length; i++) {
      const step = calculationSteps[i];
      for (const affectedItem of step.affectedItems) {
        const cartItem = items.find(it => it.lineId === affectedItem.lineId);
        if (cartItem && cartItem.shareDetail) {
          const share = cartItem.shareDetail.find(s => s.promotionId === step.id);
          if (share) {
            const prevStepMap = stepItemAmounts.get(affectedItem.lineId);
            if (prevStepMap) {
              const prevAmount = prevStepMap.get(`step_${i - 1}`) || prevStepMap.get('start') || 0;
              affectedItem.baseAmount = roundToTwo(prevAmount);
            }
            affectedItem.shareAmount = share.discountAmount;
            affectedItem.finalAmount = roundToTwo(Math.max(0, affectedItem.baseAmount - affectedItem.shareAmount));
          }
        }
      }
    }

    let finalTotal = items.reduce((sum, item) => sum + (item.finalPrice || 0), 0);
    finalTotal = roundToTwo(Math.max(0, finalTotal));

    const totalPromotionDiscount = roundToTwo(
      appliedPromotions.reduce((sum, p) => sum + p.discountAmount, 0)
    );
    const totalCouponDiscount = roundToTwo(
      appliedCoupons.reduce((sum, c) => sum + c.discountAmount, 0)
    );
    const totalDiscount = roundToTwo(originalTotal - finalTotal);

    const displayMessages = this.resultExplainer.generateSummaryMessages(
      appliedPromotions,
      appliedCoupons,
      totalDiscount
    );

    return {
      originalTotal,
      finalTotal,
      totalDiscount,
      totalPromotionDiscount,
      totalCouponDiscount,
      appliedPromotions,
      unavailablePromotions,
      appliedCoupons,
      unavailableCoupons,
      cartItems: items,
      gifts: allGifts,
      displayMessages,
      resourceUsages,
      calculationSteps
    };
  }

  private couponCanStack(
    couponCalc: CouponCalculation,
    appliedPromotionIds: string[],
    allPromotions: Promotion[],
    couponWallet: any
  ): boolean {
    const coupon = couponWallet.coupons.find((c: any) => c.id === couponCalc.couponId);
    if (!coupon) return true;

    const appliedPromotions = allPromotions.filter(p => appliedPromotionIds.includes(p.id));
    return this.exclusionChecker.canCouponStackWithPromotions(coupon, appliedPromotions);
  }

  validatePromotions(promotions: Promotion[]) {
    return this.exclusionChecker.validatePromotions(promotions);
  }

  findBestCombination(
    items: CartItem[],
    promotions: Promotion[],
    currentTime: string,
    member?: any,
    orderStoreId?: string
  ): { promotionIds: string[]; totalDiscount: number } {
    const currentTimeStr = currentTime || new Date().toISOString();
    const enabledPromotions = promotions.filter(p => p.enabled);

    const discountMap = new Map<string, number>();

    for (const promotion of enabledPromotions) {
      const matchResult = this.productMatcher.matchProductsForPromotion(items, promotion, currentTimeStr, orderStoreId);
      if (matchResult.matchedItems.length === 0) continue;

      const memberEligible = this.memberChecker.isMemberEligible(member, promotion.scope);
      if (!memberEligible.eligible) continue;

      if (promotion.type === 'birthday_discount') {
        const birthdayEligible = this.memberChecker.checkBirthdayDiscountEligible(
          member,
          currentTimeStr,
          (promotion.rule as any).requiredLevels
        );
        if (!birthdayEligible.eligible) continue;
      }

      const minReqCheck = this.productMatcher.checkMinRequirements(matchResult, promotion.scope);
      if (!minReqCheck.valid) continue;

      const discountCalc = this.discountCalculator.calculate(promotion, matchResult, member);

      if (discountCalc.discountAmount <= 0 && (!discountCalc.gifts || discountCalc.gifts.length === 0)) {
        continue;
      }

      discountMap.set(promotion.id, discountCalc.discountAmount);
    }

    const eligiblePromotions = enabledPromotions.filter(p => discountMap.has(p.id));
    const optimalIds = this.exclusionChecker.selectOptimalPromotions(eligiblePromotions, discountMap);
    const totalDiscount = optimalIds.reduce((sum, id) => sum + (discountMap.get(id) || 0), 0);

    return {
      promotionIds: optimalIds,
      totalDiscount: roundToTwo(totalDiscount)
    };
  }
}
