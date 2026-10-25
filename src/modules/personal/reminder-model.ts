import type { Action, Batch, Opportunity, Promotion } from "./opportunity-model";
import { opportunityRuleSchema } from "./opportunity-model";
import type { Rule } from "./opportunity-model";
import type { actionTasks } from "@/db/schema";

export type ReminderDraft = { sourceKey: string; kind: string; title: string; detail: string; href: string; deadlineAt: Date | null; timeZone: string };
export const closedAction = (a: Action) => ["completed", "abandoned", "failed", "expired", "cancelled", "reward_credited"].includes(a.status);
export const enrolledAction = (a: Action) => !["saved", "planned", "abandoned", "failed", "expired", "cancelled"].includes(a.status);
export function generateReminders(input: { opportunities: Opportunity[]; promotions: Array<{ promotion: Promotion; rules: Rule[]; tracked?: boolean }>; actions: Action[]; batches: Batch[]; tasks: Array<typeof actionTasks.$inferSelect>; now: Date }): ReminderDraft[] {
  const { now } = input; const drafts = new Map<string, ReminderDraft>();
  const soon = (date: Date | null, days = 14) => date !== null && date.getTime() > now.getTime() && date.getTime() <= now.getTime() + days * 86400000;
  const add = (sourceKey: string, kind: string, title: string, detail: string, href: string, deadlineAt: Date | null, timeZone: string) => drafts.set(sourceKey, { sourceKey, kind, title, detail, href, deadlineAt, timeZone });
  for (const { promotion: p, rules, tracked } of input.promotions) {
    const mine = input.actions.filter((a) => a.promotionId === p.id && !closedAction(a));
    const opportunity = input.opportunities.find((o) => o.id === p.id);
    const link = `/discover/${p.slug}`;
    const deadline = (kind: string, title: string, at: Date | null, relevant: boolean) => {
      if (relevant && soon(at)) add(`${kind}:${p.id}:${at!.toISOString()}`, kind, `${title}：${p.title}`, "基于已审核活动日期；请核对适用条件与官方规则。", link, at, p.timeZone);
    };
    const enrollmentPossible = opportunity && (opportunity.eligibility.status !== "fails-known-conditions" || opportunity.eligibility.conflicts.every((reason) => reason === "尚未完成报名"));
    deadline("enrollment", "报名即将截止", p.enrollmentEndsAt, Boolean(enrollmentPossible && opportunity.enrolled !== true && !mine.some(enrolledAction)));
    for (const rule of rules) {
      const parsed = opportunityRuleSchema.safeParse(rule.structuredContent.opportunity);
      if (parsed.success && parsed.data.spendEndsAt) deadline("spend", "消费达标窗口即将结束", new Date(parsed.data.spendEndsAt), mine.length > 0 || Boolean(tracked));
    }
    deadline("stay", "入住有效期即将结束", p.stayEndsAt, mine.length > 0 || Boolean(tracked));
    const awaitingClaim = mine.some((a) => !a.claimedAt && !a.rewardCreditedAt);
    deadline("claim-open", "奖励领取窗口即将开放", p.claimStartsAt, awaitingClaim);
    deadline("claim-end", "奖励领取即将截止", p.claimEndsAt, awaitingClaim);
    // A personally recorded claim deadline is retained even after activity end.
    for (const action of mine) if (!action.claimedAt && !action.rewardCreditedAt && action.claimDeadline && action.claimDeadline.getTime() !== p.claimEndsAt?.getTime()) {
      if (soon(action.claimDeadline)) add(`claim-action:${action.id}:${action.claimDeadline.toISOString()}`, "claim-end", `个人奖励领取即将截止：${p.title}`, "来自已保存的个人活动领取日期。", link, action.claimDeadline, p.timeZone);
    }
    if (opportunity?.ruleChanged && opportunity.eligibility.status !== "rule-pending-verification") add(`rule:${p.id}:${opportunity.fingerprint}`, "rule-change", `规则变化，重新确认资格：${p.title}`, "已发布活动或关联规则发生有效变化；旧资格和旧计算方案不可直接沿用。", "/me#opportunities", null, p.timeZone);
  }
  for (const batch of input.batches) if (batch.remainingPoints > 0n && batch.expiryStatus === "known" && batch.expiresAt && (soon(batch.expiresAt, 30) || batch.expiresAt <= now)) {
    add(`points:${batch.id}:${batch.expiresAt.toISOString()}`, "points-expiry", `${batch.expiresAt <= now ? "积分已到期，请核对" : "积分即将到期"}：${batch.source}`, `批次剩余 ${batch.remainingPoints.toString()} 分；预计奖励不在此范围。`, "/me/records#points", batch.expiresAt, "Asia/Hong_Kong");
  }
  for (const task of input.tasks) if (task.status === "todo" && task.deadlineSource !== "unconfirmed" && task.deadlineAt && (task.deadlineAt <= now || soon(task.deadlineAt, 7))) {
    add(`task:${task.id}:${task.deadlineAt.toISOString()}`, "task", `${task.deadlineAt <= now ? "待办已逾期" : "待办即将截止"}：${task.title}`, `截止依据：${{ official: "官方确认", "rule-derived": "规则推算", manual: "人工设定", unconfirmed: "未确认" }[task.deadlineSource]}。`, "/me/records#tasks", task.deadlineAt, "Asia/Hong_Kong");
  }
  return [...drafts.values()];
}
