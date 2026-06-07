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

console.log('========== 零售促销规则 SDK - 券包试算修复验证 ==========\n');

console.log('========== 测试场景 1：自动选券枚举所有组合（100元 vs 两张60元） ==========');
console.log('说明：1张100元券 与 两张60元券互斥，但两张60元彼此可叠加');
console.log('预期：选两张60元券，合计优惠120元');

const cart1 = createCart(
  [{ skuId: 'sku_test', name: '测试商品', price: 200, quantity: 2 }],
  'store_001'
);

const coupon100: Coupon = {
  id: 'coupon_100',
  name: '100元券',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 100,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  exclusiveWith: ['coupon_60a', 'coupon_60b']
};

const coupon60a: Coupon = {
  id: 'coupon_60a',
  name: '60元券A',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 60,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  exclusiveWith: ['coupon_100']
};

const coupon60b: Coupon = {
  id: 'coupon_60b',
  name: '60元券B',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 60,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  exclusiveWith: ['coupon_100']
};

const wallet1: CouponWallet = {
  coupons: [coupon100, coupon60a, coupon60b],
  selectionMode: 'auto'
};

const result1 = sdk.calculate({
  cart: cart1,
  member,
  promotions: [],
  couponWallet: wallet1,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n已应用优惠券:');
result1.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}: 优惠 ${c.discountAmount.toFixed(2)} 元`);
});
const totalCouponDiscount = result1.appliedCoupons.reduce((s, c) => s + c.discountAmount, 0);
console.log(`\n优惠券总优惠: ${totalCouponDiscount.toFixed(2)} 元`);
console.log(`预期: 120.00 元`);
console.log(`结果: ${Math.abs(totalCouponDiscount - 120) < 0.01 ? '✓ 正确' : '✗ 错误'}`);

console.log('\n未应用优惠券:');
result1.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}`);
  console.log(`    原因码: ${c.reasonCode}`);
  console.log(`    原因: ${c.reason}`);
});

console.log('\n========== 测试场景 2：活动+券叠加，商品实付不为负 ==========');
console.log('说明：100元商品，80元活动 + 80元券，总优惠最多100元，实付0元');

const cart2 = createCart(
  [{ skuId: 'sku_test', name: '测试商品', price: 100, quantity: 1 }],
  'store_001'
);

const promo80: Promotion = {
  id: 'promo_80',
  name: '满100减80活动',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 100, discountAmount: 80 },
  scope: {},
  priority: 10,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const coupon80: Coupon = {
  id: 'coupon_80',
  name: '满100减80券',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 80,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  stackableWithPromotions: true
};

const wallet2: CouponWallet = {
  coupons: [coupon80],
  selectionMode: 'auto'
};

const result2 = sdk.calculate({
  cart: cart2,
  member,
  promotions: [promo80],
  couponWallet: wallet2,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n原价:', result2.originalTotal.toFixed(2), '元');
console.log('活动优惠:', result2.totalPromotionDiscount.toFixed(2), '元');
console.log('券优惠:', result2.totalCouponDiscount.toFixed(2), '元');
console.log('总优惠:', result2.totalDiscount.toFixed(2), '元');
console.log('实付:', result2.finalTotal.toFixed(2), '元');

console.log('\n商品明细:');
result2.cartItems.forEach(item => {
  console.log(`  ${item.name} x ${item.quantity}`);
  console.log(`    原价: ${(item.price * item.quantity).toFixed(2)} 元`);
  console.log(`    优惠: ${(item.appliedDiscount || 0).toFixed(2)} 元`);
  console.log(`    实付: ${(item.finalPrice || 0).toFixed(2)} 元`);
  console.log(`    ✓ 实付非负: ${(item.finalPrice || 0) >= 0 ? '是' : '否'}`);
});

console.log('\n金额对齐校验:');
const sumItemFinal = result2.cartItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
console.log(`  商品实付之和 = ${sumItemFinal.toFixed(2)} 元`);
console.log(`  订单应付 = ${result2.finalTotal.toFixed(2)} 元`);
console.log(`  原价 - 总优惠 = ${(result2.originalTotal - result2.totalDiscount).toFixed(2)} 元`);
console.log(`  ✓ 全部对齐: ${Math.abs(sumItemFinal - result2.finalTotal) < 0.01 && Math.abs(result2.finalTotal - (result2.originalTotal - result2.totalDiscount)) < 0.01 ? '是' : '否'}`);

console.log('\n计算过程明细:');
result2.calculationSteps.forEach(step => {
  console.log(`\n  [${step.type}] ${step.name}`);
  console.log(`  计算基数: ${step.baseAmount.toFixed(2)} 元`);
  console.log(`  优惠金额: ${step.discountAmount.toFixed(2)} 元`);
  if (step.roundingDiff) {
    console.log(`  四舍五入差额: ${step.roundingDiff.toFixed(4)} 元`);
  }
  step.affectedItems.forEach(item => {
    console.log(`    - ${item.name}: 基数 ${item.baseAmount.toFixed(2)} 元, 分摊 ${item.shareAmount.toFixed(2)} 元, 实付 ${item.finalAmount.toFixed(2)} 元`);
  });
});

console.log('\n========== 测试场景 3：券与活动冲突时自动回退选择 ==========');
console.log('说明：大额券与活动互斥，低额券可与活动叠加，自动选总优惠大的组合');

const cart3 = createCart(
  [{ skuId: 'sku_test', name: '测试商品', price: 200, quantity: 1 }],
  'store_001'
);

const promo100: Promotion = {
  id: 'promo_100',
  name: '满200减100活动',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 200, discountAmount: 100 },
  scope: {},
  priority: 10,
  exclusionType: 'mutual_exclusive',
  exclusiveWith: ['coupon_big'],
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const couponBig: Coupon = {
  id: 'coupon_big',
  name: '120元大额券（与活动互斥）',
  type: 'full_reduction',
  threshold: 200,
  discountAmount: 120,
  scope: {},
  expirationDate: '2030-12-31T23:59:59',
  exclusiveWith: ['promo_100']
};

const couponSmall: Coupon = {
  id: 'coupon_small',
  name: '50元小额券（可与活动叠加）',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 50,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const wallet3: CouponWallet = {
  coupons: [couponBig, couponSmall],
  selectionMode: 'auto'
};

const result3 = sdk.calculate({
  cart: cart3,
  member,
  promotions: [promo100],
  couponWallet: wallet3,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n已应用活动:');
result3.appliedPromotions.forEach(p => {
  console.log(`  ✓ ${p.promotionName}: 优惠 ${p.discountAmount.toFixed(2)} 元`);
});

console.log('\n已应用优惠券:');
result3.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}: 优惠 ${c.discountAmount.toFixed(2)} 元`);
});

const totalDiscount3 = result3.totalDiscount;
console.log(`\n总优惠: ${totalDiscount3.toFixed(2)} 元`);
console.log(`说明：活动(100) + 小额券(50) = 150元，比只用大额券(120)更优`);
console.log(`结果: ${totalDiscount3 >= 149.99 ? '✓ 正确（选择了活动+小额券组合）' : '✗ 错误'}`);

console.log('\n未应用优惠券:');
result3.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}`);
  console.log(`    原因: ${c.reason}`);
});

console.log('\n========== 测试场景 4：计算过程明细，每一步金额连贯 ==========');
console.log('说明：同一商品被多个活动和券连续影响，每一步金额连贯');

const cart4 = createCart(
  [{ skuId: 'sku_test', name: '测试商品', price: 300, quantity: 1 }],
  'store_001'
);

const promoA: Promotion = {
  id: 'promo_a',
  name: '第一步：满300减50',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 300, discountAmount: 50 },
  scope: {},
  priority: 30,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const promoB: Promotion = {
  id: 'promo_b',
  name: '第二步：满200打9折',
  type: 'full_discount',
  rule: { type: 'full_discount', threshold: 200, discountRate: 0.9 },
  scope: {},
  priority: 20,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const couponStep: Coupon = {
  id: 'coupon_step',
  name: '第三步：再减30券',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 30,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const wallet4: CouponWallet = {
  coupons: [couponStep],
  selectionMode: 'auto'
};

const result4 = sdk.calculate({
  cart: cart4,
  member,
  promotions: [promoA, promoB],
  couponWallet: wallet4,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n计算过程（按应用顺序）:');
let runningAmount = 300;
result4.calculationSteps.forEach((step, idx) => {
  console.log(`\n  第${idx + 1}步: ${step.name}`);
  step.affectedItems.forEach(item => {
    console.log(`    ${item.name}:`);
    console.log(`      本步开始前: ${item.baseAmount.toFixed(2)} 元`);
    console.log(`      本步分摊优惠: ${item.shareAmount.toFixed(2)} 元`);
    console.log(`      本步结束后: ${item.finalAmount.toFixed(2)} 元`);
    if (item.roundingDiff) {
      console.log(`      本步四舍五入差额: ${item.roundingDiff.toFixed(4)} 元`);
    }
    runningAmount = item.finalAmount;
  });
});

console.log('\n最终商品行:');
result4.cartItems.forEach(item => {
  console.log(`  ${item.name}:`);
  console.log(`    返回的实付: ${(item.finalPrice || 0).toFixed(2)} 元`);
});

console.log('\n最后一步实付与返回的商品行实付一致性:');
const lastStepFinal = result4.calculationSteps[result4.calculationSteps.length - 1]?.affectedItems[0]?.finalAmount;
const returnedFinal = result4.cartItems[0]?.finalPrice || 0;
console.log(`  最后一步结束后: ${lastStepFinal?.toFixed(2)} 元`);
console.log(`  返回的商品行实付: ${returnedFinal.toFixed(2)} 元`);
console.log(`  ✓ 一致: ${Math.abs(lastStepFinal - returnedFinal) < 0.01 ? '是' : '否'}`);

console.log('\n========== 所有测试场景执行完毕 ==========');
