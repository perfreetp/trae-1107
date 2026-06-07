import { Member, MemberLevel, PromotionScope } from '../types';

const MEMBER_LEVEL_ORDER: MemberLevel[] = ['normal', 'silver', 'gold', 'platinum', 'diamond'];

export class MemberChecker {
  isMemberEligible(member: Member | undefined, scope: PromotionScope): {
    eligible: boolean;
    reason?: string;
  } {
    if (!scope.memberLevels || scope.memberLevels.length === 0) {
      return { eligible: true };
    }

    if (!member) {
      return {
        eligible: false,
        reason: '需要会员身份才能参与此活动'
      };
    }

    if (!scope.memberLevels.includes(member.level)) {
      return {
        eligible: false,
        reason: `当前会员等级 ${this.getLevelName(member.level)} 不满足要求，需要 ${scope.memberLevels.map(l => this.getLevelName(l)).join('、')}`
      };
    }

    return { eligible: true };
  }

  isBirthdayToday(member: Member | undefined, currentTime: string): boolean {
    if (!member || !member.birthday) {
      return false;
    }

    const now = new Date(currentTime);
    const birthday = new Date(member.birthday);

    return now.getMonth() === birthday.getMonth() && now.getDate() === birthday.getDate();
  }

  checkBirthdayDiscountEligible(
    member: Member | undefined,
    currentTime: string,
    requiredLevels?: MemberLevel[]
  ): { eligible: boolean; reason?: string } {
    if (!member) {
      return { eligible: false, reason: '需要登录会员才能享受生日折扣' };
    }

    if (!member.birthday) {
      return { eligible: false, reason: '请完善生日信息' };
    }

    if (!this.isBirthdayToday(member, currentTime)) {
      return { eligible: false, reason: '今天不是您的生日' };
    }

    if (requiredLevels && requiredLevels.length > 0) {
      if (!requiredLevels.includes(member.level)) {
        return {
          eligible: false,
          reason: `当前会员等级 ${this.getLevelName(member.level)} 不满足生日折扣要求`
        };
      }
    }

    return { eligible: true };
  }

  getLevelName(level: MemberLevel): string {
    const levelNames: Record<MemberLevel, string> = {
      normal: '普通会员',
      silver: '银卡会员',
      gold: '金卡会员',
      platinum: '铂金会员',
      diamond: '钻石会员'
    };
    return levelNames[level] || level;
  }

  compareLevels(level1: MemberLevel, level2: MemberLevel): number {
    const index1 = MEMBER_LEVEL_ORDER.indexOf(level1);
    const index2 = MEMBER_LEVEL_ORDER.indexOf(level2);
    return index1 - index2;
  }

  isLevelSufficient(currentLevel: MemberLevel, requiredLevel: MemberLevel): boolean {
    return this.compareLevels(currentLevel, requiredLevel) >= 0;
  }
}
