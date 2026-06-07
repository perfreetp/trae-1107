import {
  TrialRequest,
  CalculationResult,
  PromotionResult,
  UnavailablePromotion,
  Promotion,
  GiftItem,
  CartItem
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
    const { cart, member, promotions, couponWallet } = request;

    const originalTotal = cart.totalAmount;

    let items = this.discountAllocator.initializeItems([...cart.items]);

    const enabledPromotions = promotions.filter(p => p.enabled);

    const promotionResults: Map<string, {
      promotion: Promotion;
      matchResult: any;
      discountCalc: DiscountCalculation;
      memberEligible: boolean;
      minReqValid: boolean;
    }> = new Map();

    const unavailablePromotions: UnavailablePromotion[] = [];

    for (const promotion of enabledPromotions) {
      const matchResult = this.productMatcher.matchProductsForPromotion(items, promotion, currentTime);

      if (matchResult.matchedItems.length === 0) {
        unavailablePromotions.push(
          this.resultExplainer.generateUnavailablePromotion(
            promotion,
            '购物车中没有符合活动范围的商品',
            'NOT_IN_SCOPE'
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

      const { promotion, discountCalc } = result;

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

    const appliedCoupons: PromotionResult[] = [];
    const unavailableCoupons: UnavailablePromotion[] = [];

    if (couponWallet && couponWallet.coupons.length > 0) {
      const selectedCoupons = this.couponHandler.getSelectedCoupons(
        couponWallet,
        items,
        currentTime,
        member
      );

      for (const couponCalc of selectedCoupons) {
        if (couponCalc.applicable) {
          const canStack = this.couponCanStack(couponCalc, optimalPromotionIds, promotions, couponWallet);

          if (!canStack) {
            unavailableCoupons.push({
              promotionId: couponCalc.couponId,
              promotionName: couponCalc.couponName,
              reason: '优惠券与当前活动不能叠加',
              reasonCode: 'EXCLUDED_BY_OTHER'
            });
            continue;
          }

          appliedCoupons.push({
            promotionId: couponCalc.couponId,
            promotionName: couponCalc.couponName,
            promotionType: 'coupon',
            applied: true,
            discountAmount: couponCalc.discountAmount,
            hitReason: '满足优惠券使用条件',
            affectedItems: couponCalc.affectedItems,
            displayText: this.resultExplainer.generateCouponDisplayText(
              {
                id: couponCalc.couponId,
                name: couponCalc.couponName,
                type: 'full_reduction',
                threshold: 0,
                scope: {},
                expirationDate: ''
              } as any,
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
        } else {
          unavailableCoupons.push({
            promotionId: couponCalc.couponId,
            promotionName: couponCalc.couponName,
            reason: couponCalc.unavailabilityReason || '优惠券不可用',
            reasonCode: 'COUPON_THRESHOLD_NOT_MET'
          });
        }
      }
    }

    items = this.discountAllocator.allocateMultipleDiscounts(items, allocationRequests);

    let finalTotal = items.reduce((sum, item) => sum + (item.finalPrice || 0), 0);
    finalTotal = roundToTwo(Math.max(0, finalTotal));

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
      appliedPromotions,
      unavailablePromotions,
      appliedCoupons,
      unavailableCoupons,
      cartItems: items,
      gifts: allGifts,
      displayMessages
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
    member?: any
  ): { promotionIds: string[]; totalDiscount: number } {
    const currentTimeStr = currentTime || new Date().toISOString();
    const enabledPromotions = promotions.filter(p => p.enabled);

    const discountMap = new Map<string, number>();

    for (const promotion of enabledPromotions) {
      const matchResult = this.productMatcher.matchProductsForPromotion(items, promotion, currentTimeStr);
      if (matchResult.matchedItems.length === 0) continue;

      const memberEligible = this.memberChecker.isMemberEligible(member, promotion.scope);
      if (!memberEligible.eligible) continue;

      const minReqCheck = this.productMatcher.checkMinRequirements(matchResult, promotion.scope);
      if (!minReqCheck.valid) continue;

      const discountCalc = this.discountCalculator.calculate(promotion, matchResult, member);
      discountMap.set(promotion.id, discountCalc.discountAmount);
    }

    const optimalIds = this.exclusionChecker.selectOptimalPromotions(enabledPromotions, discountMap);
    const totalDiscount = optimalIds.reduce((sum, id) => sum + (discountMap.get(id) || 0), 0);

    return {
      promotionIds: optimalIds,
      totalDiscount: roundToTwo(totalDiscount)
    };
  }
}
