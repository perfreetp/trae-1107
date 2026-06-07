// @ts-nocheck
import {
  RetailPromotionSDK,
  Cart,
  Member,
  Promotion,
  Coupon,
  CouponWallet,
  TrialRequest
} from './index';

const sdk = new RetailPromotionSDK();

function createCart(
  items: { skuId: string; name: string; price: number; quantity: number; storeId?: string; categoryId?: string }[],
  storeId?: string
): Cart {
  const cartItems = items.map((item, index) => ({
    lineId: `line_${index + 1}`,
    skuId: item.skuId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    storeId: item.storeId,
    categoryId: item.categoryId || 'cat_default'
  }));

  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items: cartItems,
    totalAmount,
    totalQuantity,
    storeId,
    userId: 'user_001'
  };
}

const member: Member = {
  memberId: 'mem_001',
  level: 'gold',
  points: 5000,
  birthday: '2000-06-07'
};

const promoStore001: Promotion = {
  id: 'promo_store_001',
  name: 'store_001 专享满80减20',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 80, discountAmount: 20 },
  scope: { storeIds: ['store_001'], minAmount: 80 },
  priority: 10,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true,
  totalBudget: 10000,
  usedBudget: 5000,
  totalUsageLimit: 1000,
  usedCount: 500,
  perUserLimit: 5,
  userUsedCount: 2
};

const promoExpired: Promotion = {
  id: 'promo_expired',
  name: '已过期活动',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
  scope: {},
  priority: 1,
  exclusionType: 'stackable',
  startTime: '2020-01-01T00:00:00',
  endTime: '2020-12-31T23:59:59',
  enabled: true
};

const promoNotStarted: Promotion = {
  id: 'promo_not_started',
  name: '未开始活动',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
  scope: {},
  priority: 1,
  exclusionType: 'stackable',
  startTime: '2030-01-01T00:00:00',
  endTime: '2035-12-31T23:59:59',
  enabled: true
};

const promoOtherStore: Promotion = {
  id: 'promo_other_store',
  name: '其他门店活动',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 50, discountAmount: 10 },
  scope: { storeIds: ['store_999'] },
  priority: 1,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const couponFullReduction: Coupon = {
  id: 'coupon_50off',
  name: '满150减50券',
  type: 'full_reduction',
  threshold: 150,
  discountAmount: 50,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  totalCount: 1000,
  usedCount: 200,
  totalBudget: 50000,
  usedBudget: 10000
};

const couponDiscount: Coupon = {
  id: 'coupon_80pct',
  name: '8折券',
  type: 'full_discount',
  threshold: 100,
  discountRate: 0.8,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const couponFixedPrice: Coupon = {
  id: 'coupon_99',
  name: '99元特价券',
  type: 'fixed_price',
  threshold: 100,
  fixedPrice: 99,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const couponStore002: Coupon = {
  id: 'coupon_store002',
  name: 'store_002专属券',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 30,
  scope: { storeIds: ['store_002'] },
  expirationDate: '2030-12-31T23:59:59'
};

const couponMutuallyExclusive: Coupon = {
  id: 'coupon_exclusive',
  name: '互斥券（不能与满减券同用）',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 40,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  exclusiveWith: ['coupon_50off']
};

const birthdayPromo: Promotion = {
  id: 'promo_birthday',
  name: '生日8折',
  type: 'birthday_discount',
  rule: { type: 'birthday_discount', discountRate: 0.8 },
  scope: {},
  priority: 50,
  exclusionType: 'override',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const secondItemPromo: Promotion = {
  id: 'promo_second_item',
  name: '牛奶买2送1',
  type: 'second_item',
  rule: { type: 'second_item', discountType: 'free', buyCount: 2, giftCount: 1 },
  scope: { productIds: ['sku_milk'] },
  priority: 20,
  exclusionType: 'mutual_exclusive',
  exclusiveWith: ['promo_birthday'],
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

console.log('========== 零售促销规则 SDK - 新增功能验证 ==========\n');

console.log('========== 测试场景 1：门店券门店不匹配直接返回原因 ==========');
console.log('说明：购物车门店是 store_001，券只适用 store_002');
const cart1 = createCart(
  [{ skuId: 'sku_milk', name: '牛奶', price: 10, quantity: 10 }],
  'store_001'
);
const wallet1: CouponWallet = {
  coupons: [couponStore002],
  selectionMode: 'manual',
  selectedCouponIds: ['coupon_store002']
};
const result1 = sdk.calculate({
  cart: cart1,
  member,
  promotions: [],
  couponWallet: wallet1,
  currentTime: '2026-06-07T12:00:00',
  storeId: 'store_001'
});
console.log('不可用券:');
result1.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}`);
  console.log(`    原因码: ${c.reasonCode}`);
  console.log(`    原因: ${c.reason}`);
});
console.log('已用券数量:', result1.appliedCoupons.length, '(预期 0，不会把0元券放进已用券)\n');

console.log('========== 测试场景 2：自动选券模式（挑优惠最大的组合） ==========');
const cart2 = createCart(
  [{ skuId: 'sku_milk', name: '牛奶', price: 50, quantity: 5 }],
  'store_001'
);
const wallet2: CouponWallet = {
  coupons: [couponFullReduction, couponDiscount, couponFixedPrice],
  selectionMode: 'auto'
};
const result2 = sdk.calculate({
  cart: cart2,
  member,
  promotions: [],
  couponWallet: wallet2,
  currentTime: '2026-06-07T12:00:00'
});
console.log('已应用优惠券:');
result2.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}: 优惠 ${c.discountAmount.toFixed(2)} 元`);
  console.log(`    文案: ${c.displayText}`);
});
console.log('未应用优惠券:');
result2.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}: ${c.reason}`);
});
console.log('');

console.log('========== 测试场景 3：手动选券，有互斥时提示 ==========');
const wallet3: CouponWallet = {
  coupons: [couponFullReduction, couponMutuallyExclusive],
  selectionMode: 'manual',
  selectedCouponIds: ['coupon_50off', 'coupon_exclusive']
};
const result3 = sdk.calculate({
  cart: cart2,
  member,
  promotions: [],
  couponWallet: wallet3,
  currentTime: '2026-06-07T12:00:00'
});
console.log('已应用优惠券:');
result3.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}`);
});
console.log('未应用优惠券:');
result3.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}`);
  console.log(`    原因码: ${c.reasonCode}`);
  console.log(`    原因: ${c.reason}`);
});
console.log('');

console.log('========== 测试场景 4：预算和次数限制，返回预计占用信息 ==========');
const cart4 = createCart(
  [{ skuId: 'sku_milk', name: '牛奶', price: 30, quantity: 3 }],
  'store_001'
);
const result4 = sdk.calculate({
  cart: cart4,
  member,
  promotions: [promoStore001],
  currentTime: '2026-06-07T12:00:00'
});
console.log('资源占用信息:');
result4.resourceUsages.forEach(usage => {
  console.log(`  ${usage.name} (${usage.type}):`);
  if (usage.budgetUsed !== undefined) {
    console.log(`    预算: 已用 ${usage.budgetUsed?.toFixed(2)} / 剩余 ${usage.budgetRemaining?.toFixed(2)}`);
    console.log(`    本次预计占用预算: ${usage.estimatedBudgetConsumption?.toFixed(2)}`);
  }
  if (usage.countUsed !== undefined) {
    console.log(`    总次数: 已用 ${usage.countUsed} / 剩余 ${usage.countRemaining}`);
  }
  if (usage.userCountUsed !== undefined) {
    console.log(`    用户次数: 已用 ${usage.userCountUsed} / 剩余 ${usage.userCountRemaining}`);
    console.log(`    本次预计占用次数: ${usage.estimatedCountConsumption}`);
  }
});
console.log('');

console.log('========== 测试场景 5：计算过程明细 ==========');
const cart5 = createCart(
  [
    { skuId: 'sku_milk', name: '牛奶', price: 10, quantity: 3 },
    { skuId: 'sku_bread', name: '面包', price: 20, quantity: 2 }
  ],
  'store_001'
);
const wallet5: CouponWallet = {
  coupons: [couponFullReduction],
  selectionMode: 'manual',
  selectedCouponIds: ['coupon_50off']
};
const result5 = sdk.calculate({
  cart: cart5,
  member,
  promotions: [secondItemPromo, promoStore001],
  couponWallet: wallet5,
  currentTime: '2026-06-07T12:00:00'
});
console.log('计算过程明细:');
result5.calculationSteps.forEach(step => {
  console.log(`\n  [${step.type}] ${step.name}`);
  console.log(`  计算基数: ${step.baseAmount.toFixed(2)} 元`);
  console.log(`  优惠金额: ${step.discountAmount.toFixed(2)} 元`);
  if (step.roundingDiff) {
    console.log(`  四舍五入差额: ${step.roundingDiff.toFixed(4)} 元`);
  }
  console.log(`  影响商品:`);
  step.affectedItems.forEach(item => {
    console.log(`    - ${item.name}: 基数 ${item.baseAmount.toFixed(2)} 元, 分摊 ${item.shareAmount.toFixed(2)} 元, 实付 ${item.finalAmount.toFixed(2)} 元`);
    if (item.roundingDiff) {
      console.log(`      (四舍五入差额 ${item.roundingDiff.toFixed(4)} 元落在该行)`);
    }
  });
});

console.log('\n  金额对齐校验:');
console.log(`  原价: ${result5.originalTotal.toFixed(2)} 元`);
console.log(`  活动优惠总额: ${result5.totalPromotionDiscount.toFixed(2)} 元`);
console.log(`  券优惠总额: ${result5.totalCouponDiscount.toFixed(2)} 元`);
console.log(`  总优惠: ${result5.totalDiscount.toFixed(2)} 元`);
console.log(`  实付: ${result5.finalTotal.toFixed(2)} 元`);
console.log(`  原价 - 总优惠 = ${(result5.originalTotal - result5.totalDiscount).toFixed(2)} 元`);
console.log(`  商品实付之和 = ${result5.cartItems.reduce((s, i) => s + (i.finalPrice || 0), 0).toFixed(2)} 元`);
console.log(`  ✓ 对齐: ${Math.abs(result5.finalTotal - (result5.originalTotal - result5.totalDiscount)) < 0.01 ? '是' : '否'}\n`);

console.log('========== 测试场景 6：综合场景 - 生日当天多种活动 ==========');
const cart6 = createCart(
  [
    { skuId: 'sku_milk', name: '牛奶', price: 10, quantity: 3 },
    { skuId: 'sku_bread', name: '面包', price: 20, quantity: 2 },
    { skuId: 'sku_cookie', name: '饼干', price: 15, quantity: 4 }
  ],
  'store_001'
);
const wallet6: CouponWallet = {
  coupons: [couponFullReduction, couponDiscount],
  selectionMode: 'auto'
};
const result6 = sdk.calculate({
  cart: cart6,
  member,
  promotions: [birthdayPromo, secondItemPromo, promoStore001, promoExpired, promoNotStarted, promoOtherStore],
  couponWallet: wallet6,
  currentTime: '2026-06-07T12:00:00'
});
console.log('原价:', result6.originalTotal.toFixed(2), '元');
console.log('优惠后:', result6.finalTotal.toFixed(2), '元');
console.log('共优惠:', result6.totalDiscount.toFixed(2), '元');

console.log('\n已应用的活动:');
result6.appliedPromotions.forEach(p => {
  console.log(`  ✓ [${p.promotionType}] ${p.promotionName}`);
  console.log(`    优惠: ${p.discountAmount.toFixed(2)} 元`);
  console.log(`    文案: ${p.displayText}`);
});

console.log('\n已应用的优惠券:');
result6.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}`);
  console.log(`    优惠: ${c.discountAmount.toFixed(2)} 元`);
  console.log(`    文案: ${c.displayText}`);
});

console.log('\n未应用的活动:');
result6.unavailablePromotions.forEach(p => {
  console.log(`  ✗ ${p.promotionName} (${p.reasonCode})`);
  console.log(`    原因: ${p.reason}`);
});

console.log('\n前台展示文案:');
result6.displayMessages.forEach(msg => console.log(`  ${msg}`));

console.log('\n========== 所有测试场景执行完毕 ==========');
