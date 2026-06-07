// @ts-nocheck
import {
  RetailPromotionSDK,
  Cart,
  Member,
  Promotion,
  Coupon,
  CouponWallet
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

console.log('========== 测试场景 1：金额口径对齐（100元商品+80活动+80券） ==========');
console.log('说明：100元商品叠加80元活动和80元券，券实际只能抵20元');

const cart1 = createCart(
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

const wallet1: CouponWallet = {
  coupons: [coupon80],
  selectionMode: 'auto'
};

const result1 = sdk.calculate({
  cart: cart1,
  member,
  promotions: [promo80],
  couponWallet: wallet1,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n金额汇总:');
console.log(`  原价: ${result1.originalTotal.toFixed(2)} 元`);
console.log(`  活动优惠: ${result1.totalPromotionDiscount.toFixed(2)} 元 (面值80)`);
console.log(`  券优惠: ${result1.totalCouponDiscount.toFixed(2)} 元 (面值80，实际只抵20)`);
console.log(`  总优惠: ${result1.totalDiscount.toFixed(2)} 元`);
console.log(`  实付: ${result1.finalTotal.toFixed(2)} 元`);

console.log('\n口径校验:');
const p1 = result1.totalPromotionDiscount;
const c1 = result1.totalCouponDiscount;
const t1 = result1.totalDiscount;
const s1 = result1.cartItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
console.log(`  活动优惠 + 券优惠 = ${(p1 + c1).toFixed(2)} 元`);
console.log(`  总优惠 = ${t1.toFixed(2)} 元`);
console.log(`  ✓ 活动+券 = 总优惠: ${Math.abs(p1 + c1 - t1) < 0.01 ? '是' : '否'}`);
console.log(`  原价 - 总优惠 = ${(100 - t1).toFixed(2)} 元`);
console.log(`  商品实付之和 = ${s1.toFixed(2)} 元`);
console.log(`  订单应付 = ${result1.finalTotal.toFixed(2)} 元`);
console.log(`  ✓ 三者对齐: ${Math.abs(100 - t1 - s1) < 0.01 && Math.abs(s1 - result1.finalTotal) < 0.01 ? '是' : '否'}`);

console.log('\n活动和券详情:');
result1.appliedPromotions.forEach(p => {
  console.log(`  活动: ${p.promotionName}`);
  console.log(`    显示优惠: ${p.discountAmount.toFixed(2)} 元`);
  console.log(`    文案: ${p.displayText}`);
});
result1.appliedCoupons.forEach(c => {
  console.log(`  券: ${c.promotionName}`);
  console.log(`    显示优惠: ${c.discountAmount.toFixed(2)} 元 (不是面值80)`);
  console.log(`    文案: ${c.displayText}`);
});

console.log('\n========== 测试场景 2：活动侧写互斥券也要生效 ==========');
console.log('说明：活动标记和大额券互斥、大额券没反向配置，小额券能叠加');
console.log('预期：保留活动，选小额券（总优惠=活动+小额券）');

const cart2 = createCart(
  [{ skuId: 'sku_test', name: '测试商品', price: 200, quantity: 1 }],
  'store_001'
);

const promoWithExclude: Promotion = {
  id: 'promo_exclude',
  name: '满200减100活动（和大额券互斥）',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 200, discountAmount: 100 },
  scope: {},
  priority: 10,
  exclusionType: 'stackable',
  exclusiveWith: ['coupon_big'],
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const couponBig: Coupon = {
  id: 'coupon_big',
  name: '120元大额券（没写和活动互斥）',
  type: 'full_reduction',
  threshold: 200,
  discountAmount: 120,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const couponSmall: Coupon = {
  id: 'coupon_small',
  name: '50元小额券（可叠加）',
  type: 'full_reduction',
  threshold: 100,
  discountAmount: 50,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const wallet2: CouponWallet = {
  coupons: [couponBig, couponSmall],
  selectionMode: 'auto'
};

const result2 = sdk.calculate({
  cart: cart2,
  member,
  promotions: [promoWithExclude],
  couponWallet: wallet2,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n已应用活动:');
result2.appliedPromotions.forEach(p => {
  console.log(`  ✓ ${p.promotionName}: 优惠 ${p.discountAmount.toFixed(2)} 元`);
});

console.log('\n已应用优惠券:');
result2.appliedCoupons.forEach(c => {
  console.log(`  ✓ ${c.promotionName}: 优惠 ${c.discountAmount.toFixed(2)} 元`);
});

console.log('\n未应用优惠券:');
result2.unavailableCoupons.forEach(c => {
  console.log(`  ✗ ${c.promotionName}`);
  console.log(`    原因码: ${c.reasonCode}`);
  console.log(`    原因: ${c.reason}`);
});

const total2 = result2.totalDiscount;
console.log(`\n总优惠: ${total2.toFixed(2)} 元`);
console.log(`预期：活动(100) + 小额券(50) = 150元（优于单张大额券120）`);
console.log(`结果: ${total2 >= 149.99 ? '✓ 正确（活动+小额券组合）' : '✗ 错误'}`);

console.log('\n========== 测试场景 3：计算过程明细每一步基数连贯 ==========');
console.log('说明：连续满减、折扣、券三步，每一步接着上一步实付算');

const cart3 = createCart(
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

const wallet3: CouponWallet = {
  coupons: [couponStep],
  selectionMode: 'auto'
};

const result3 = sdk.calculate({
  cart: cart3,
  member,
  promotions: [promoA, promoB],
  couponWallet: wallet3,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n计算过程（按应用顺序）:');
let prevAmount = 300;
result3.calculationSteps.forEach((step, idx) => {
  console.log(`\n  第${idx + 1}步: ${step.name} (${step.type})`);
  console.log(`  本步总基数: ${step.baseAmount.toFixed(2)} 元`);
  console.log(`  本步总优惠: ${step.discountAmount.toFixed(2)} 元`);
  
  step.affectedItems.forEach(item => {
    console.log(`    ${item.name}:`);
    console.log(`      本步开始前: ${item.baseAmount.toFixed(2)} 元`);
    console.log(`      本步分摊: ${item.shareAmount.toFixed(2)} 元`);
    console.log(`      本步结束后: ${item.finalAmount.toFixed(2)} 元`);
    if (item.roundingDiff) {
      console.log(`      四舍五入差额: ${item.roundingDiff.toFixed(4)} 元`);
    }
    prevAmount = item.finalAmount;
  });
});

console.log('\n最后一步 vs 返回商品行:');
const lastStepFinal = result3.calculationSteps[result3.calculationSteps.length - 1]?.affectedItems[0]?.finalAmount;
const returnedFinal = result3.cartItems[0]?.finalPrice || 0;
console.log(`  最后一步结束后: ${lastStepFinal?.toFixed(2)} 元`);
console.log(`  返回的商品行实付: ${returnedFinal.toFixed(2)} 元`);
console.log(`  ✓ 一致: ${Math.abs(lastStepFinal - returnedFinal) < 0.01 ? '是' : '否'}`);

console.log('\n========== 测试场景 4：多商品分摊明细合计对齐 ==========');
console.log('说明：多商品分摊，明细合计 = 汇总字段，最后一件承差额');

const cart4 = createCart(
  [
    { skuId: 'sku_a', name: '商品A', price: 33.33, quantity: 1 },
    { skuId: 'sku_b', name: '商品B', price: 33.33, quantity: 1 },
    { skuId: 'sku_c', name: '商品C', price: 33.34, quantity: 1 }
  ],
  'store_001'
);

const promo10: Promotion = {
  id: 'promo_10',
  name: '满100减10（分摊到3个商品）',
  type: 'full_reduction',
  rule: { type: 'full_reduction', threshold: 100, discountAmount: 10 },
  scope: {},
  priority: 10,
  exclusionType: 'stackable',
  startTime: '2024-01-01T00:00:00',
  endTime: '2030-12-31T23:59:59',
  enabled: true
};

const coupon5: Coupon = {
  id: 'coupon_5',
  name: '再减5券',
  type: 'full_reduction',
  threshold: 90,
  discountAmount: 5,
  scope: {},
  expirationDate: '2030-12-31T23:59:59'
};

const wallet4: CouponWallet = {
  coupons: [coupon5],
  selectionMode: 'auto'
};

const result4 = sdk.calculate({
  cart: cart4,
  member,
  promotions: [promo10],
  couponWallet: wallet4,
  currentTime: '2026-06-07T12:00:00'
});

console.log('\n分摊明细校验:');
result4.calculationSteps.forEach(step => {
  console.log(`\n  [${step.type}] ${step.name}`);
  const detailSum = step.affectedItems.reduce((s, a) => s + a.shareAmount, 0);
  const summaryAmount = step.discountAmount;
  console.log(`    明细分摊合计: ${detailSum.toFixed(4)} 元`);
  console.log(`    汇总优惠金额: ${summaryAmount.toFixed(4)} 元`);
  console.log(`    ✓ 一致: ${Math.abs(detailSum - summaryAmount) < 0.001 ? '是' : '否'}`);
  
  step.affectedItems.forEach((item, idx) => {
    const isLast = idx === step.affectedItems.length - 1;
    console.log(`      ${item.name}: 分摊 ${item.shareAmount.toFixed(4)} 元 ${isLast ? '(最后一件，承接差额)' : ''}`);
    if (item.roundingDiff) {
      console.log(`        承接四舍五入差额: ${item.roundingDiff.toFixed(4)} 元`);
    }
  });
});

console.log('\n最终金额对齐:');
const sumItemFinal = result4.cartItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
console.log(`  商品实付之和: ${sumItemFinal.toFixed(2)} 元`);
console.log(`  订单应付: ${result4.finalTotal.toFixed(2)} 元`);
console.log(`  原价 - 总优惠: ${(100 - result4.totalDiscount).toFixed(2)} 元`);
console.log(`  ✓ 全部对齐: ${Math.abs(sumItemFinal - result4.finalTotal) < 0.01 && Math.abs(result4.finalTotal - (100 - result4.totalDiscount)) < 0.01 ? '是' : '否'}`);

console.log('\n========== 所有测试场景执行完毕 ==========');
