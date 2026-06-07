import {
  RetailPromotionSDK,
  Cart,
  Member,
  Promotion,
  CouponWallet,
  Coupon
} from './index';

const sdk = new RetailPromotionSDK();

const cart: Cart = {
  items: [
    {
      lineId: 'line_001',
      skuId: 'sku_001',
      name: '牛奶 250ml',
      price: 10,
      quantity: 3,
      categoryId: 'cat_001',
      categoryPath: ['食品', '饮料', '乳制品'],
      brandId: 'brand_001',
      storeId: 'store_001'
    },
    {
      lineId: 'line_002',
      skuId: 'sku_002',
      name: '面包 500g',
      price: 20,
      quantity: 2,
      categoryId: 'cat_002',
      categoryPath: ['食品', '烘焙', '面包'],
      brandId: 'brand_002',
      storeId: 'store_001'
    },
    {
      lineId: 'line_003',
      skuId: 'sku_003',
      name: '饼干 300g',
      price: 15,
      quantity: 4,
      categoryId: 'cat_003',
      categoryPath: ['食品', '零食', '饼干'],
      brandId: 'brand_001',
      storeId: 'store_001'
    }
  ],
  totalAmount: 10 * 3 + 20 * 2 + 15 * 4,
  totalQuantity: 3 + 2 + 4,
  storeId: 'store_001',
  userId: 'user_001'
};

const member: Member = {
  memberId: 'member_001',
  level: 'gold',
  points: 5000,
  birthday: '1990-06-07',
  joinDate: '2020-01-01',
  tags: ['活跃用户']
};

const promotions: Promotion[] = [
  {
    id: 'promo_001',
    name: '全场满100减20',
    type: 'full_reduction',
    rule: {
      type: 'full_reduction',
      threshold: 100,
      discountAmount: 20,
      isCycle: true
    },
    scope: {
      storeIds: ['store_001']
    },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_002',
    name: '牛奶买2送1',
    type: 'second_item',
    rule: {
      type: 'second_item',
      discountType: 'free',
      buyCount: 2,
      giftCount: 1
    },
    scope: {
      productIds: ['sku_001'],
      storeIds: ['store_001']
    },
    priority: 20,
    exclusionType: 'mutual_exclusive',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_003',
    name: '会员专享9折',
    type: 'full_discount',
    rule: {
      type: 'full_discount',
      threshold: 0,
      discountRate: 0.9
    },
    scope: {
      memberLevels: ['gold', 'platinum', 'diamond'],
      storeIds: ['store_001']
    },
    priority: 5,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_004',
    name: '生日8折优惠',
    type: 'birthday_discount',
    rule: {
      type: 'birthday_discount',
      discountRate: 0.8,
      requiredLevels: ['silver', 'gold', 'platinum', 'diamond']
    },
    scope: {
      storeIds: ['store_001']
    },
    priority: 15,
    exclusionType: 'mutual_exclusive',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_005',
    name: '满150送赠品',
    type: 'step_gift',
    rule: {
      type: 'step_gift',
      steps: [
        {
          threshold: 150,
          gifts: [
            {
              skuId: 'gift_001',
              name: '精美小礼品',
              quantity: 1,
              price: 0
            }
          ]
        }
      ]
    },
    scope: {
      storeIds: ['store_001']
    },
    priority: 8,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  }
];

const coupon: Coupon = {
  id: 'coupon_001',
  name: '50元无门槛券',
  code: 'SAVE50',
  type: 'full_reduction',
  threshold: 0,
  discountAmount: 50,
  scope: {
    storeIds: ['store_001']
  },
  maxDiscount: 50,
  expirationDate: '2026-12-31T23:59:59',
  usedCount: 0,
  totalCount: 100,
  stackableWithPromotions: true
};

const couponWallet: CouponWallet = {
  coupons: [coupon],
  selectedCouponIds: ['coupon_001']
};

const currentTime = '2026-06-07T12:00:00';

console.log('========== 零售促销规则 SDK 演示 ==========\n');

console.log('购物车商品:');
cart.items.forEach(item => {
  console.log(`  ${item.name} x ${item.quantity} = ${item.price * item.quantity}元`);
});
console.log(`购物车原价总计: ${cart.totalAmount}元\n`);

console.log('========== 1. 活动校验 ==========');
const validationResult = sdk.validatePromotions(promotions);
console.log('活动配置是否有效:', validationResult.valid);
if (validationResult.conflicts.length > 0) {
  console.log('检测到的冲突:');
  validationResult.conflicts.forEach(c => {
    console.log(`  - ${c.description}`);
  });
}
if (validationResult.warnings.length > 0) {
  console.log('警告:');
  validationResult.warnings.forEach(w => {
    console.log(`  - ${w}`);
  });
}
console.log('');

console.log('========== 2. 计算最优优惠组合 ==========');
const bestCombo = sdk.findBestCombination(cart.items, promotions, currentTime, member);
console.log('最优活动组合 ID:', bestCombo.promotionIds);
console.log('预计最大优惠金额:', bestCombo.totalDiscount, '元\n');

console.log('========== 3. 完整试算 ==========');
const result = sdk.calculate({
  cart,
  member,
  promotions,
  couponWallet,
  currentTime,
  storeId: 'store_001'
});

console.log(`原价: ${result.originalTotal.toFixed(2)}元`);
console.log(`优惠后: ${result.finalTotal.toFixed(2)}元`);
console.log(`共优惠: ${result.totalDiscount.toFixed(2)}元\n`);

console.log('已应用的活动:');
result.appliedPromotions.forEach(p => {
  console.log(`  ✓ [${p.promotionType}] ${p.promotionName}`);
  console.log(`    优惠金额: ${p.discountAmount.toFixed(2)}元`);
  console.log(`    命中原因: ${p.hitReason}`);
  console.log(`    展示文案: ${p.displayText}`);
});

if (result.appliedCoupons.length > 0) {
  console.log('\n已应用的优惠券:');
  result.appliedCoupons.forEach(c => {
    console.log(`  ✓ [${c.promotionType}] ${c.promotionName}`);
    console.log(`    优惠金额: ${c.discountAmount.toFixed(2)}元`);
    console.log(`    展示文案: ${c.displayText}`);
  });
}

if (result.gifts.length > 0) {
  console.log('\n赠送商品:');
  result.gifts.forEach(g => {
    console.log(`  🎁 ${g.name} x ${g.quantity}`);
  });
}

if (result.unavailablePromotions.length > 0) {
  console.log('\n未应用的活动:');
  result.unavailablePromotions.forEach(p => {
    console.log(`  ✗ ${p.promotionName}`);
    console.log(`    原因: ${p.reason}`);
  });
}

if (result.unavailableCoupons.length > 0) {
  console.log('\n未应用的优惠券:');
  result.unavailableCoupons.forEach(c => {
    console.log(`  ✗ ${c.promotionName}`);
    console.log(`    原因: ${c.reason}`);
  });
}

console.log('\n========== 4. 商品优惠分摊明细 ==========');
result.cartItems.forEach(item => {
  console.log(`\n商品: ${item.name} x ${item.quantity}`);
  console.log(`  原价: ${(item.price * item.quantity).toFixed(2)}元`);
  console.log(`  优惠: ${(item.appliedDiscount || 0).toFixed(2)}元`);
  console.log(`  实付: ${(item.finalPrice || 0).toFixed(2)}元`);
  if (item.shareDetail && item.shareDetail.length > 0) {
    console.log(`  优惠分摊:`);
    item.shareDetail.forEach(d => {
      console.log(`    - ${d.promotionName}: ${d.discountAmount.toFixed(2)}元`);
    });
  }
});

console.log('\n========== 5. 前台展示文案 ==========');
result.displayMessages.forEach(msg => {
  console.log(`  ${msg}`);
});

console.log('\n========== 演示结束 ==========');
