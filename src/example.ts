import {
  RetailPromotionSDK,
  Cart,
  Member,
  Promotion,
  CouponWallet,
  Coupon
} from './index';

const sdk = new RetailPromotionSDK();

console.log('========== 零售促销规则 SDK - 问题修复验证 ==========\n');

const member: Member = {
  memberId: 'member_001',
  level: 'gold',
  points: 5000,
  birthday: '1990-06-07',
  joinDate: '2020-01-01',
  tags: ['活跃用户']
};

const memberNotBirthday: Member = {
  memberId: 'member_002',
  level: 'gold',
  points: 3000,
  birthday: '1990-12-25',
  joinDate: '2020-01-01'
};

const currentTime = '2026-06-07T12:00:00';

console.log('========== 测试场景 1：商品未填门店，使用订单门店 ==========');
console.log('说明：商品只填 sku、价格、数量，购物车传 store_001');

const cartNoStore: Cart = {
  items: [
    {
      lineId: 'line_001',
      skuId: 'sku_001',
      name: '牛奶 250ml',
      price: 10,
      quantity: 2
    },
    {
      lineId: 'line_002',
      skuId: 'sku_002',
      name: '面包 500g',
      price: 20,
      quantity: 3
    }
  ],
  totalAmount: 10 * 2 + 20 * 3,
  totalQuantity: 5,
  storeId: 'store_001'
};

const promotionsForStore: Promotion[] = [
  {
    id: 'promo_store_001',
    name: 'store_001 专享满80减20',
    type: 'full_reduction',
    rule: {
      type: 'full_reduction',
      threshold: 80,
      discountAmount: 20
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
    id: 'promo_store_002',
    name: 'store_002 专享满100减30',
    type: 'full_reduction',
    rule: {
      type: 'full_reduction',
      threshold: 100,
      discountAmount: 30
    },
    scope: {
      storeIds: ['store_002']
    },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  }
];

const result1 = sdk.calculate({
  cart: cartNoStore,
  member,
  promotions: promotionsForStore,
  currentTime,
  storeId: 'store_001'
});

console.log(`购物车原价: ${result1.originalTotal.toFixed(2)}元`);
console.log(`优惠后: ${result1.finalTotal.toFixed(2)}元`);
console.log(`共优惠: ${result1.totalDiscount.toFixed(2)}元`);
console.log('已应用的活动:');
result1.appliedPromotions.forEach(p => {
  console.log(`  ✓ ${p.promotionName}: ${p.displayText}`);
});
console.log('未应用的活动:');
result1.unavailablePromotions.forEach(p => {
  console.log(`  ✗ ${p.promotionName} (${p.reasonCode}): ${p.reason}`);
});
console.log('');

console.log('========== 测试场景 2：第二件优惠分摊验证（买2送1） ==========');
console.log('说明：牛奶10元 x 3件，买2送1，应该只减10元，而不是减30元');

const cartSecondItem: Cart = {
  items: [
    {
      lineId: 'line_001',
      skuId: 'sku_001',
      name: '牛奶 250ml',
      price: 10,
      quantity: 3,
      storeId: 'store_001'
    }
  ],
  totalAmount: 30,
  totalQuantity: 3,
  storeId: 'store_001'
};

const promotionSecondItem: Promotion = {
  id: 'promo_second_001',
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
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2026-12-31T23:59:59',
  enabled: true
};

const result2 = sdk.calculate({
  cart: cartSecondItem,
  member,
  promotions: [promotionSecondItem],
  currentTime
});

console.log(`购物车原价: ${result2.originalTotal.toFixed(2)}元`);
console.log(`优惠后: ${result2.finalTotal.toFixed(2)}元`);
console.log(`活动优惠金额: ${result2.appliedPromotions[0]?.discountAmount.toFixed(2)}元`);
console.log('商品分摊明细:');
result2.cartItems.forEach(item => {
  console.log(`  ${item.name} x ${item.quantity}`);
  console.log(`    原价: ${(item.price * item.quantity).toFixed(2)}元`);
  console.log(`    优惠: ${(item.appliedDiscount || 0).toFixed(2)}元`);
  console.log(`    实付: ${(item.finalPrice || 0).toFixed(2)}元`);
  if (item.shareDetail) {
    item.shareDetail.forEach(d => {
      console.log(`    - ${d.promotionName}: ${d.discountAmount.toFixed(2)}元`);
    });
  }
});
const discountMatch = Math.abs(result2.totalDiscount - 10) < 0.01;
console.log(`优惠金额校验: 预期10元, 实际${result2.totalDiscount.toFixed(2)}元, ${discountMatch ? '✓ 正确' : '✗ 错误'}`);
console.log('');

console.log('========== 测试场景 3：最优组合 - 生日不是当天排除 ==========');
console.log('说明：会员生日是12月25日，当前6月7日，生日折扣不应进入最优组合');

const bestCombo = sdk.findBestCombination(
  cartNoStore.items,
  promotionsForStore,
  currentTime,
  memberNotBirthday,
  'store_001'
);

console.log('最优活动组合 ID:', bestCombo.promotionIds);
console.log('预计最大优惠金额:', bestCombo.totalDiscount, '元');
const hasBirthdayPromo = bestCombo.promotionIds.some(id => id.includes('birthday'));
console.log(`是否包含生日折扣: ${hasBirthdayPromo ? '✗ 错误' : '✓ 正确（已排除）'}`);
console.log('');

console.log('========== 测试场景 4：不可用原因细分 ==========');

const promotionsVarious: Promotion[] = [
  {
    id: 'promo_expired',
    name: '已过期活动',
    type: 'full_reduction',
    rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
    scope: { storeIds: ['store_001'] },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2020-01-01T00:00:00',
    endTime: '2020-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_not_started',
    name: '未开始活动',
    type: 'full_reduction',
    rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
    scope: { storeIds: ['store_001'] },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2030-01-01T00:00:00',
    endTime: '2030-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_wrong_store',
    name: '其他门店活动',
    type: 'full_reduction',
    rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
    scope: { storeIds: ['store_999'] },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'promo_no_match_sku',
    name: '仅限定商品活动',
    type: 'full_reduction',
    rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
    scope: { productIds: ['sku_999'], storeIds: ['store_001'] },
    priority: 10,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  }
];

const result4 = sdk.calculate({
  cart: cartNoStore,
  member,
  promotions: promotionsVarious,
  currentTime,
  storeId: 'store_001'
});

console.log('未应用的活动及原因:');
result4.unavailablePromotions.forEach(p => {
  console.log(`  ✗ ${p.promotionName}`);
  console.log(`    原因码: ${p.reasonCode}`);
  console.log(`    原因: ${p.reason}`);
});
console.log('');

console.log('========== 测试场景 5：不同类型优惠券文案 ==========');

const cartForCoupon: Cart = {
  items: [
    {
      lineId: 'line_001',
      skuId: 'sku_001',
      name: '商品A',
      price: 100,
      quantity: 2,
      storeId: 'store_001'
    }
  ],
  totalAmount: 200,
  totalQuantity: 2,
  storeId: 'store_001'
};

const couponFullReduction: Coupon = {
  id: 'coupon_001',
  name: '满150减50券',
  type: 'full_reduction',
  threshold: 150,
  discountAmount: 50,
  scope: { storeIds: ['store_001'] },
  expirationDate: '2026-12-31T23:59:59',
  stackableWithPromotions: true
};

const couponDiscount: Coupon = {
  id: 'coupon_002',
  name: '8折券',
  type: 'full_discount',
  threshold: 0,
  discountRate: 0.8,
  scope: { storeIds: ['store_001'] },
  expirationDate: '2026-12-31T23:59:59',
  stackableWithPromotions: true
};

const couponFixedPrice: Coupon = {
  id: 'coupon_003',
  name: '99元特价券',
  type: 'fixed_price',
  threshold: 100,
  fixedPrice: 99,
  scope: { storeIds: ['store_001'] },
  expirationDate: '2026-12-31T23:59:59',
  stackableWithPromotions: true
};

const couponTypes = [
  { name: '满减券', coupon: couponFullReduction },
  { name: '折扣券', coupon: couponDiscount },
  { name: '固定价券', coupon: couponFixedPrice }
];

for (const ct of couponTypes) {
  const wallet: CouponWallet = {
    coupons: [ct.coupon],
    selectedCouponIds: [ct.coupon.id]
  };

  const result = sdk.calculate({
    cart: cartForCoupon,
    member,
    promotions: [],
    couponWallet: wallet,
    currentTime
  });

  console.log(`${ct.name}:`);
  result.appliedCoupons.forEach(c => {
    console.log(`  文案: ${c.displayText}`);
    console.log(`  优惠: ${c.discountAmount.toFixed(2)}元`);
  });
}
console.log('');

console.log('========== 测试场景 6：完整综合场景 ==========');
console.log('会员生日当天，购物车有多种商品，多种活动，使用优惠券');

const fullCart: Cart = {
  items: [
    { lineId: 'l1', skuId: 'sku_001', name: '牛奶', price: 10, quantity: 3 },
    { lineId: 'l2', skuId: 'sku_002', name: '面包', price: 20, quantity: 2 },
    { lineId: 'l3', skuId: 'sku_003', name: '饼干', price: 15, quantity: 4 }
  ],
  totalAmount: 130,
  totalQuantity: 9,
  storeId: 'store_001'
};

const allPromotions: Promotion[] = [
  {
    id: 'p_birthday',
    name: '生日8折',
    type: 'birthday_discount',
    rule: { type: 'birthday_discount', discountRate: 0.8, requiredLevels: ['silver', 'gold', 'platinum', 'diamond'] },
    scope: { storeIds: ['store_001'] },
    priority: 15,
    exclusionType: 'mutual_exclusive',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'p_second',
    name: '牛奶买2送1',
    type: 'second_item',
    rule: { type: 'second_item', discountType: 'free', buyCount: 2, giftCount: 1 },
    scope: { productIds: ['sku_001'], storeIds: ['store_001'] },
    priority: 20,
    exclusionType: 'mutual_exclusive',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  },
  {
    id: 'p_member',
    name: '会员9折',
    type: 'full_discount',
    rule: { type: 'full_discount', threshold: 0, discountRate: 0.9 },
    scope: { memberLevels: ['gold', 'platinum', 'diamond'], storeIds: ['store_001'] },
    priority: 5,
    exclusionType: 'stackable',
    startTime: '2024-01-01T00:00:00',
    endTime: '2026-12-31T23:59:59',
    enabled: true
  }
];

const walletFull: CouponWallet = {
  coupons: [couponFullReduction],
  selectedCouponIds: ['coupon_001']
};

const result6 = sdk.calculate({
  cart: fullCart,
  member,
  promotions: allPromotions,
  couponWallet: walletFull,
  currentTime,
  storeId: 'store_001'
});

console.log(`原价: ${result6.originalTotal.toFixed(2)}元`);
console.log(`优惠后: ${result6.finalTotal.toFixed(2)}元`);
console.log(`共优惠: ${result6.totalDiscount.toFixed(2)}元\n`);

console.log('已应用的活动:');
result6.appliedPromotions.forEach(p => {
  console.log(`  ✓ [${p.promotionType}] ${p.promotionName}`);
  console.log(`    优惠: ${p.discountAmount.toFixed(2)}元`);
  console.log(`    原因: ${p.hitReason}`);
  console.log(`    文案: ${p.displayText}`);
});

console.log('\n已应用的优惠券:');
result6.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}`);
  console.log(`    优惠: ${c.discountAmount.toFixed(2)}元`);
  console.log(`    文案: ${c.displayText}`);
});

console.log('\n未应用的活动:');
result6.unavailablePromotions.forEach(p => {
  console.log(`  ✗ ${p.promotionName} (${p.reasonCode})`);
  console.log(`    原因: ${p.reason}`);
});

console.log('\n商品明细:');
result6.cartItems.forEach(item => {
  console.log(`\n  ${item.name} x ${item.quantity}`);
  console.log(`    原价: ${(item.price * item.quantity).toFixed(2)}元`);
  console.log(`    优惠: ${(item.appliedDiscount || 0).toFixed(2)}元`);
  console.log(`    实付: ${(item.finalPrice || 0).toFixed(2)}元`);
  if (item.shareDetail && item.shareDetail.length > 0) {
    console.log(`    分摊:`);
    item.shareDetail.forEach(d => {
      console.log(`      - ${d.promotionName}: ${d.discountAmount.toFixed(2)}元`);
    });
  }
});

console.log('\n前台展示文案:');
result6.displayMessages.forEach(msg => {
  console.log(`  ${msg}`);
});

console.log('\n========== 所有测试场景执行完毕 ==========');
