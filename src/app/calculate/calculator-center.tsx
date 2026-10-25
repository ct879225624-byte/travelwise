"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Coins, GitCompareArrows, Info, ShieldCheck } from "lucide-react";
import { calculateActivityReward, compareOfferQuotes, compareRateQuotes, formatMicros, formatMinor, parseMinor, parsePointValue, parsePoints, simulateStacking } from "@/modules/decision";
import type { OfferQuote, Quote, RuleApplicability, StackingRelation } from "@/modules/decision";
import { SectionHeading } from "@/components/section-heading";
import type { PublicPromotion } from "@/modules/intelligence/model";

type CalculatorType = "rate-comparison" | "offer-comparison" | "activity-reward";
type RestoredInputs = Record<string, unknown>;
type PromotionContext = { promotion: PublicPromotion; ruleApplicability: RuleApplicability | null };
const textInput = (snapshot: RestoredInputs | undefined, key: string, fallback: string) => typeof snapshot?.[key] === "string" ? snapshot[key] as string : fallback;
const booleanInput = (snapshot: RestoredInputs | undefined, key: string, fallback: boolean) => typeof snapshot?.[key] === "boolean" ? snapshot[key] as boolean : fallback;
const jsonSnapshot = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
const quoteInstant = (value: string, restored?: RestoredInputs) => value && restored?.quotedAt === value && typeof restored.quotedAtIso === "string" ? restored.quotedAtIso : value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

const fieldClass = "focus-ring mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-brand-deep outline-none";
const money = (value: bigint) => `¥${formatMinor(value)}`;
const safe = <T,>(work: () => T): T | null => { try { return work(); } catch { return null; } };

export function CalculatorCenter({ only, initialReward, promotionRef }: { only?: "rates" | "offers" | "rewards"; initialReward?: string; promotionRef?: string }) {
  const [restored, setRestored] = useState<{ calculatorType: CalculatorType; inputSnapshot: RestoredInputs } | null>(null);
  const [restoreMessage, setRestoreMessage] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("restore") !== "1") return;
      try {
        const stored = JSON.parse(sessionStorage.getItem("travelwise:recalculate") ?? "null");
        const expected = only === "rates" ? "rate-comparison" : only === "offers" ? "offer-comparison" : "activity-reward";
        if (!stored || stored.calculatorType !== expected || typeof stored.inputSnapshot !== "object" || !stored.inputSnapshot || Array.isArray(stored.inputSnapshot)) throw new Error("invalid snapshot");
        setRestored(stored);
        setRestoreMessage("已恢复原始输入并重新计算。活动关联依据使用当前公开版本；再次保存会新增方案，原始历史保持不变。");
      } catch { setRestoreMessage("未能恢复方案输入，请返回我的决策重新打开。当前显示的是计算器示例。"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [only]);
  const cards = [
    { href: "/calculate/rates", icon: Coins, title: "房价与多倍积分", text: "比较实际现金差额、额外积分和盈亏平衡积分价值。" },
    { href: "/calculate/offers", icon: GitCompareArrows, title: "优惠组合比较", text: "比较最终报价，或在叠加关系明确后模拟假设组合。" },
    { href: "/calculate/rewards", icon: ShieldCheck, title: "活动回报计算", text: "把本来就要花的钱与为达标增加的成本分开。" },
  ];
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14 lg:px-8">
    <SectionHeading eyebrow="Decision" title="把实际价值算清楚" description="输入 App 或来源中看到的实际报价。计算结果会把现金、积分、估值、证据和未知条件分开说明。" />
    {!only && <div className="mt-8 grid gap-4 md:grid-cols-3">{cards.map(({ href, icon: Icon, title, text }) => <Link key={href} href={href} className="focus-ring rounded-3xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand/35"><span className="grid size-10 place-items-center rounded-2xl bg-amber-50 text-accent"><Icon size={20} /></span><h2 className="mt-5 text-lg font-extrabold text-brand-deep">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{text}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand">开始计算<ArrowRight size={15} /></span></Link>)}</div>}
    {restoreMessage && <Notice>{restoreMessage}</Notice>}
    {(!only || only === "rates") && <RateCalculator promotionRef={promotionRef} key={"rates:" + jsonSnapshot(restored)} restored={restored?.calculatorType === "rate-comparison" ? restored.inputSnapshot : undefined} />}
    {(!only || only === "offers") && <OfferCalculator promotionRef={promotionRef} key={"offers:" + jsonSnapshot(restored)} restored={restored?.calculatorType === "offer-comparison" ? restored.inputSnapshot : undefined} />}
    {(!only || only === "rewards") && <RewardCalculator key={"rewards:" + jsonSnapshot(restored)} initialReward={initialReward} promotionRef={promotionRef} restored={restored?.calculatorType === "activity-reward" ? restored.inputSnapshot : undefined} />}
  </section>;
}

function Panel({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} className="mt-8 scroll-mt-24 rounded-[2rem] border border-line bg-surface p-5 shadow-sm sm:p-8"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-soft text-brand">{icon}</span><div><h2 className="text-xl font-extrabold text-brand-deep">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div></div>{children}</section>;
}

function Field({ label, value, onChange, type = "text", min, step, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string; placeholder?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  return <label className="block text-sm font-bold text-brand-deep">{label}<input className={fieldClass} type={type} inputMode={inputMode} value={value} min={min} step={step} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Notice({ children }: { children: React.ReactNode }) { return <div className="mt-5 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"><CircleAlert size={17} className="mt-1 shrink-0" />{children}</div>; }

function MoneyResult({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className="rounded-2xl border border-line bg-surface-soft p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className={`mt-1 text-xl font-black text-brand-deep ${className}`}>{value}</p></div>; }

function RateCalculator({ restored, promotionRef }: { restored?: RestoredInputs; promotionRef?: string }) {
  const associatedPromotion = textInput(restored, "promotionRef", promotionRef ?? "");
  const [standardCash, setStandardCash] = useState(textInput(restored, "standardCash", "300.00")); const [standardPoints, setStandardPoints] = useState(textInput(restored, "standardPoints", "450"));
  const [bonusCash, setBonusCash] = useState(textInput(restored, "bonusCash", "350.00")); const [bonusPoints, setBonusPoints] = useState(textInput(restored, "bonusPoints", "2800")); const [pointValue, setPointValue] = useState(textInput(restored, "pointValue", "0.02"));
  const [cancellation, setCancellation] = useState(textInput(restored, "cancellation", "可取消")); const [bonusCancellation, setBonusCancellation] = useState(textInput(restored, "bonusCancellation", "可取消"));
  const [quotedAt, setQuotedAt] = useState(textInput(restored, "quotedAt", "")); const [source, setSource] = useState(textInput(restored, "source", ""));
  const [hotel, setHotel] = useState(textInput(restored, "hotel", "同一酒店")); const [room, setRoom] = useState(textInput(restored, "room", "同一房型")); const [checkIn, setCheckIn] = useState(textInput(restored, "checkIn", "2026-12-01")); const [checkOut, setCheckOut] = useState(textInput(restored, "checkOut", "2026-12-02")); const [breakfast, setBreakfast] = useState(textInput(restored, "breakfast", "未改变")); const [benefits, setBenefits] = useState(textInput(restored, "benefits", "未改变"));
  const result = useMemo(() => safe(() => compareRateQuotes({ standard: makeQuote(standardCash, standardPoints, source, cancellation, quotedAt, hotel, room, checkIn, checkOut, breakfast, benefits), bonus: makeQuote(bonusCash, bonusPoints, source, bonusCancellation, quotedAt, hotel, room, checkIn, checkOut, breakfast, benefits), pointValueMicros: parsePointValue(pointValue) })), [standardCash, standardPoints, bonusCash, bonusPoints, pointValue, source, cancellation, bonusCancellation, quotedAt, hotel, room, checkIn, checkOut, breakfast, benefits]);
  return <Panel id="rates" icon={<Coins size={20} />} title="普通房价 vs 多倍积分房价" description="两种报价都应含必要税费，并尽量保持酒店、房型、日期和权益一致。">
    <div className="mt-6 grid gap-4 rounded-2xl bg-surface-soft p-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="酒店" value={hotel} onChange={setHotel} /><Field label="房型" value={room} onChange={setRoom} /><Field label="入住日期" type="date" value={checkIn} onChange={setCheckIn} /><Field label="退房日期" type="date" value={checkOut} onChange={setCheckOut} /><Field label="早餐权益" value={breakfast} onChange={setBreakfast} /><Field label="其他重要权益" value={benefits} onChange={setBenefits} /></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><QuoteForm title="方案 A · 普通会员价" cash={standardCash} points={standardPoints} setCash={setStandardCash} setPoints={setStandardPoints} cancellation={cancellation} setCancellation={setCancellation} source={source} setSource={setSource} quotedAt={quotedAt} setQuotedAt={setQuotedAt} /><QuoteForm title="方案 B · 多倍积分价" cash={bonusCash} points={bonusPoints} setCash={setBonusCash} setPoints={setBonusPoints} cancellation={bonusCancellation} setCancellation={setBonusCancellation} source={source} setSource={setSource} quotedAt={quotedAt} setQuotedAt={setQuotedAt} /></div>
    <div className="mt-5 max-w-sm"><Field label="我的积分估值（元/分）" value={pointValue} onChange={setPointValue} inputMode="decimal" /></div>
    {result ? <div className="mt-6"><div className="grid gap-3 sm:grid-cols-3"><MoneyResult label="多花现金" value={money(result.extraCashMinor)} /><MoneyResult label="额外积分" value={result.extraPoints === null ? "未知" : `${result.extraPoints.toString()} 分`} /><MoneyResult label="额外积分估值" value={result.extraPointsValueMicros === null ? "未知" : `¥${formatMicros(result.extraPointsValueMicros)}`} /></div><div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 p-5"><p className="text-sm font-bold text-brand">净增量价值</p><p className={`mt-1 text-3xl font-black ${result.netIncrementalValueMicros !== null && result.netIncrementalValueMicros < 0n ? "text-rose-700" : "text-brand-deep"}`}>{result.netIncrementalValueMicros === null ? "无法计算" : `¥${formatMicros(result.netIncrementalValueMicros)}`}</p><p className="mt-2 text-sm leading-6 text-muted">{result.recommendation === "standard" ? "在当前输入和权益相同假设下，普通会员价经济价值更高。" : result.recommendation === "bonus" ? "在当前输入和权益相同假设下，多倍积分价经济价值更高。" : "条件不可完全比较，暂不输出无条件最优方案。"}</p>{result.breakEvenValueMicrosPerPoint && <p className="mt-2 text-sm font-bold text-brand-deep">积分价值临界点：¥{result.breakEvenValueMicrosPerPoint}/分</p>}</div><Explain formula={result.formula} reasons={result.reasons} /><SaveScenarioButton calculatorType="rate-comparison" inputSnapshot={{ promotionRef: associatedPromotion, standardCash, standardPoints, bonusCash, bonusPoints, pointValue, source, quotedAt, quotedAtIso: quoteInstant(quotedAt, restored), hotel, room, checkIn, checkOut, breakfast, benefits, cancellation, bonusCancellation }} result={result} quotedAt={quotedAt} quoteSource={source} pointValueMicros={parsePointValue(pointValue)} /></div> : <Notice>请检查现金、积分估值和积分数量输入。积分未知时只显示现金差额，不会生成无条件推荐。</Notice>}
  </Panel>;
}

function QuoteForm({ title, cash, points, setCash, setPoints, cancellation, setCancellation, source, setSource, quotedAt, setQuotedAt }: { title: string; cash: string; points: string; setCash: (value: string) => void; setPoints: (value: string) => void; cancellation: string; setCancellation: (value: string) => void; source: string; setSource: (value: string) => void; quotedAt: string; setQuotedAt: (value: string) => void }) {
  return <div className="rounded-2xl border border-line p-4"><h3 className="font-extrabold text-brand-deep">{title}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="现金总价（元）" value={cash} onChange={setCash} inputMode="decimal" /><Field label="预计获得积分" value={points} onChange={setPoints} inputMode="numeric" /><Field label="报价来源" value={source} onChange={setSource} /><Field label="查询时间" type="datetime-local" value={quotedAt} onChange={setQuotedAt} /><label className="text-sm font-bold text-brand-deep sm:col-span-2">取消条件<select className={fieldClass} value={cancellation} onChange={(event) => setCancellation(event.target.value)}><option>可取消</option><option>不可取消</option><option>待核实</option></select></label></div></div>;
}

function makeQuote(cash: string, points: string, source: string, cancellation: string, quotedAt: string, hotel: string, room: string, checkIn: string, checkOut: string, breakfast: string, benefits: string): Quote { return { cashMinor: parseMinor(cash), pointsEarned: points.trim() ? parsePoints(points) : null, source, hotel, room, checkIn, checkOut, cancellation, breakfast, benefits, quotedAt, taxesIncluded: true }; }

function OfferCalculator({ restored, promotionRef }: { restored?: RestoredInputs; promotionRef?: string }) {
  const associatedPromotion = textInput(restored, "promotionRef", promotionRef ?? "");
  const [aCash, setACash] = useState(textInput(restored, "aCash", "300.00")); const [aTaxes, setATaxes] = useState(textInput(restored, "aTaxes", "0.00")); const [aEarned, setAEarned] = useState(textInput(restored, "aEarned", "450")); const [aSpent, setASpent] = useState(textInput(restored, "aSpent", "0")); const [aEligibility, setAEligibility] = useState(textInput(restored, "aEligibility", "meets-known-conditions"));
  const [bCash, setBCash] = useState(textInput(restored, "bCash", "280.00")); const [bTaxes, setBTaxes] = useState(textInput(restored, "bTaxes", "0.00")); const [bEarned, setBEarned] = useState(textInput(restored, "bEarned", "200")); const [bSpent, setBSpent] = useState(textInput(restored, "bSpent", "1000")); const [bEligibility, setBEligibility] = useState(textInput(restored, "bEligibility", "information-insufficient"));
  const [offerPointValue, setOfferPointValue] = useState(textInput(restored, "offerPointValue", "0.02")); const [sameRights, setSameRights] = useState(booleanInput(restored, "sameRights", false));
  const [original, setOriginal] = useState(textInput(restored, "original", "300.00")); const [percent, setPercent] = useState(textInput(restored, "percent", "10")); const [coupon, setCoupon] = useState(textInput(restored, "coupon", "20")); const [relation, setRelation] = useState<StackingRelation>(textInput(restored, "relation", "unknown") as StackingRelation); const [assume, setAssume] = useState(booleanInput(restored, "assume", false));
  const [quotedAt, setQuotedAt] = useState(textInput(restored, "quotedAt", "")); const [source, setSource] = useState(textInput(restored, "source", ""));
  const result = useMemo(() => safe(() => compareOfferQuotes({ pointValueMicros: parsePointValue(offerPointValue), quotes: [offerQuote("会员价", aCash, aTaxes, aSpent, aEarned, aEligibility, sameRights), offerQuote("活动价", bCash, bTaxes, bSpent, bEarned, bEligibility, sameRights)] })), [aCash, aTaxes, aSpent, aEarned, aEligibility, bCash, bTaxes, bSpent, bEarned, bEligibility, offerPointValue, sameRights]);
  const stack = useMemo(() => safe(() => simulateStacking({ originalCashMinor: parseMinor(original), discounts: [{ id: "member", label: "会员折扣", kind: "percent", basisPoints: Math.round(Number(percent) * 100) }, { id: "coupon", label: "优惠券", kind: "fixed", amountMinor: parseMinor(coupon) }], order: ["member", "coupon"], relations: { member: { coupon: relation } }, assumeUnknown: assume })), [original, percent, coupon, relation, assume]);
  return <Panel id="offers" icon={<GitCompareArrows size={20} />} title="酒店优惠组合比较" description="默认比较各渠道最终报价；优惠叠加模拟会单独标注已核实或假设状态。">
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="报价来源" value={source} onChange={setSource} placeholder="填写两种报价各自来源" /><Field label="查询时间" type="datetime-local" value={quotedAt} onChange={setQuotedAt} /></div>
    <div className="mt-6 flex flex-wrap gap-2 text-sm font-bold"><span className="rounded-full bg-brand px-3 py-1.5 text-white">模式 A · 最终报价</span><span className="rounded-full bg-surface-soft px-3 py-1.5 text-brand">模式 B · 叠加模拟</span></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><OfferForm title="报价 A · 会员价" cash={aCash} setCash={setACash} taxes={aTaxes} setTaxes={setATaxes} spent={aSpent} setSpent={setASpent} earned={aEarned} setEarned={setAEarned} eligibility={aEligibility} setEligibility={setAEligibility} /><OfferForm title="报价 B · 活动/券后价" cash={bCash} setCash={setBCash} taxes={bTaxes} setTaxes={setBTaxes} spent={bSpent} setSpent={setBSpent} earned={bEarned} setEarned={setBEarned} eligibility={bEligibility} setEligibility={setBEligibility} /></div>
    <div className="mt-5 flex flex-wrap items-end gap-4"><div className="w-full max-w-xs"><Field label="我的积分估值（元/分）" value={offerPointValue} onChange={setOfferPointValue} /></div><label className="flex items-center gap-2 pb-2 text-sm font-bold text-brand-deep"><input type="checkbox" checked={sameRights} onChange={(event) => setSameRights(event.target.checked)} />两种报价权益完全相同</label></div>
    {result && <div className="mt-5 rounded-2xl border border-brand/20 bg-brand/5 p-5"><div className="grid gap-3 sm:grid-cols-2">{result.quotes.map((quote) => <MoneyResult key={quote.id} label={`${quote.label} 假设综合成本`} value={quote.economicCostMicros === null ? "信息不足" : `¥${formatMicros(quote.economicCostMicros)}`} />)}</div><p className="mt-3 text-sm font-bold text-brand-deep">现金差额：{money(result.cashDifferenceMinor ?? 0n)}</p><p className="mt-2 text-sm leading-6 text-muted">{result.recommendation ? `在当前假设下最低综合成本为：${result.recommendation}` : "条件或资格不完整，暂不输出最优方案。"}</p><Explain formula={result.formula} reasons={result.reasons} /><SaveScenarioButton calculatorType="offer-comparison" inputSnapshot={{ promotionRef: associatedPromotion, aCash, aTaxes, aSpent, aEarned, aEligibility, bCash, bTaxes, bSpent, bEarned, bEligibility, offerPointValue, sameRights, original, percent, coupon, relation, assume, quotedAt, quotedAtIso: quoteInstant(quotedAt, restored), source }} result={{ ...result, stacking: stack }} quotedAt={quotedAt} quoteSource={source} pointValueMicros={parsePointValue(offerPointValue)} /></div>}
    <div className="mt-8 border-t border-line pt-6"><h3 className="font-extrabold text-brand-deep">叠加模拟（示例）</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="原始房价（元）" value={original} onChange={setOriginal} /><Field label="会员折扣（%）" value={percent} onChange={setPercent} /><Field label="优惠券（元）" value={coupon} onChange={setCoupon} /><label className="text-sm font-bold text-brand-deep">会员价 + 优惠券<select className={fieldClass} value={relation} onChange={(event) => setRelation(event.target.value as StackingRelation)}><option value="unknown">待核实</option><option value="verified-allowed">已核实可叠加</option><option value="verified-disallowed">已核实不可叠加</option><option value="conditional">有条件可叠加</option></select></label></div><label className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-deep"><input type="checkbox" checked={assume} onChange={(event) => setAssume(event.target.checked)} />允许假设模拟（非已核实可用优惠）</label>{stack && <div className="mt-4 rounded-2xl bg-surface-soft p-4"><p className="text-sm font-bold text-brand">{stack.status === "verified-usable" ? "已核实可用组合" : stack.status === "assumption-only" ? "假设模拟，非已核实可用优惠" : "组合被阻止"}</p><p className="mt-1 text-2xl font-black text-brand-deep">最终现金：{money(stack.finalCashMinor)} · 消耗积分：{stack.pointsSpent.toString()} 分</p>{stack.warnings.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-800">{warning}</p>)}</div>}</div>
  </Panel>;
}

function OfferForm({ title, cash, setCash, taxes, setTaxes, spent, setSpent, earned, setEarned, eligibility, setEligibility }: { title: string; cash: string; setCash: (value: string) => void; taxes: string; setTaxes: (value: string) => void; spent: string; setSpent: (value: string) => void; earned: string; setEarned: (value: string) => void; eligibility: string; setEligibility: (value: string) => void }) {
  return <div className="rounded-2xl border border-line p-4"><h3 className="font-extrabold text-brand-deep">{title}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="最终现金（元）" value={cash} onChange={setCash} /><Field label="其中税费（元）" value={taxes} onChange={setTaxes} /><Field label="消耗积分" value={spent} onChange={setSpent} /><Field label="预计返分" value={earned} onChange={setEarned} /><label className="text-sm font-bold text-brand-deep sm:col-span-2">资格状态<select className={fieldClass} value={eligibility} onChange={(event) => setEligibility(event.target.value)}><option value="meets-known-conditions">符合已知条件</option><option value="information-insufficient">信息不足</option><option value="rule-pending-verification">规则待核实</option><option value="fails-known-conditions">不符合已知条件</option></select></label></div></div>;
}

function offerQuote(label: string, cash: string, taxes: string, spent: string, earned: string, eligibility: string, sameRights: boolean): OfferQuote { return { id: label, label, cashMinor: parseMinor(cash), taxesMinor: parseMinor(taxes), pointsSpent: parsePoints(spent), pointsEarned: earned.trim() ? parsePoints(earned) : null, cancellation: sameRights ? "相同" : label, breakfast: sameRights ? "相同" : label, benefits: sameRights ? "相同" : label, eligibility: eligibility as OfferQuote["eligibility"] }; }

function RewardCalculator({ initialReward, promotionRef, restored }: { initialReward?: string; promotionRef?: string; restored?: RestoredInputs }) {
  const associatedPromotion = textInput(restored, "promotionRef", promotionRef ?? "");
  const [threshold, setThreshold] = useState(textInput(restored, "threshold", "3000.00")); const [qualifying, setQualifying] = useState(textInput(restored, "qualifying", "3000.00")); const [planned, setPlanned] = useState(textInput(restored, "planned", "3000.00")); const [extra, setExtra] = useState(textInput(restored, "extra", "0.00")); const [rewardPoints, setRewardPoints] = useState(textInput(restored, "rewardPoints", initialReward ?? "8000")); const [pointValue, setPointValue] = useState(textInput(restored, "pointValue", "0.02")); const [extraCost, setExtraCost] = useState(textInput(restored, "extraCost", "0.00")); const [fee, setFee] = useState(textInput(restored, "fee", "0.00")); const [used, setUsed] = useState(textInput(restored, "used", "0")); const [limit, setLimit] = useState(textInput(restored, "limit", "1")); const [claimStatus, setClaimStatus] = useState(textInput(restored, "claimStatus", "not-required")); const [qualificationStatus, setQualificationStatus] = useState(associatedPromotion ? "information-insufficient" : textInput(restored, "qualificationStatus", "meets-known-conditions"));
  const [quotedAt, setQuotedAt] = useState(textInput(restored, "quotedAt", "")); const [source, setSource] = useState(textInput(restored, "source", ""));
  const [foregone, setForegone] = useState(textInput(restored, "foregone", "0.00"));
  const [rewardStatus, setRewardStatus] = useState(textInput(restored, "rewardStatus", "pending"));
  const [context, setContext] = useState<PromotionContext | null>(null);
  const [contextMessage, setContextMessage] = useState("");
  useEffect(() => {
    if (!associatedPromotion) return;
    const controller = new AbortController();
    fetch(`/calculate/context?promotion=${encodeURIComponent(associatedPromotion)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("活动当前未公开，不能取得新规则依据。历史方案仍保留原始依据。"); return response.json() as Promise<PromotionContext>; })
      .then((value) => { setContext(value); setContextMessage(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setContextMessage(error instanceof Error ? error.message : "无法载入活动依据，请稍后重试。"); });
    return () => controller.abort();
  }, [associatedPromotion]);
  const effectiveQualification = associatedPromotion && (!context || context.ruleApplicability?.status !== "usable" || context.promotion.lifecycleStatus !== "active") ? "rule-pending-verification" : qualificationStatus;
  const result = useMemo(() => safe(() => calculateActivityReward({ thresholdMinor: parseMinor(threshold), qualifyingSpendMinor: parseMinor(qualifying), plannedSpendMinor: parseMinor(planned), extraSpendMinor: parseMinor(extra), reward: { type: "fixed-points", points: parsePoints(rewardPoints) }, pointValueMicros: parsePointValue(pointValue), extraEconomicCostMinor: parseMinor(extraCost), foregoneValueMinor: parseMinor(foregone), participationFeeMinor: parseMinor(fee), usesAlready: Number(used), usesLimit: limit === "" ? null : Number(limit), claimStatus: claimStatus as "not-required" | "required-not-claimed" | "claimed" | "expired", rewardStatus: rewardStatus as "not-issued" | "pending" | "issued", qualificationStatus: effectiveQualification as "meets-known-conditions" | "fails-known-conditions" | "information-insufficient" | "rule-pending-verification" })), [threshold, qualifying, planned, extra, rewardPoints, pointValue, extraCost, foregone, fee, used, limit, claimStatus, effectiveQualification, rewardStatus]);
  return <Panel id="rewards" icon={<ShieldCheck size={20} />} title="积分活动回报计算" description="以不参加活动为基准，只把新增经济成本和放弃权益计入成本。">
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="活动门槛（元）" value={threshold} onChange={setThreshold} /><Field label="符合条件消费（元）" value={qualifying} onChange={setQualifying} /><Field label="原本计划消费（元）" value={planned} onChange={setPlanned} /><Field label="为了达标额外消费（元）" value={extra} onChange={setExtra} /><Field label="奖励积分" value={rewardPoints} onChange={setRewardPoints} /><Field label="每积分估值（元/分）" value={pointValue} onChange={setPointValue} /><Field label="新增经济成本（元）" value={extraCost} onChange={setExtraCost} /><Field label="参与费用（元）" value={fee} onChange={setFee} /><Field label="已经使用次数" value={used} onChange={setUsed} /><Field label="次数上限（留空=未知）" value={limit} onChange={setLimit} /><label className="text-sm font-bold text-brand-deep">资格信息状态<select className={fieldClass} value={qualificationStatus} onChange={(event) => setQualificationStatus(event.target.value)}><option value="meets-known-conditions">符合已知条件</option><option value="information-insufficient">信息不足</option><option value="fails-known-conditions">不符合已知条件</option><option value="rule-pending-verification">规则待核实</option></select></label><label className="text-sm font-bold text-brand-deep">领奖状态<select className={fieldClass} value={claimStatus} onChange={(event) => setClaimStatus(event.target.value)}><option value="not-required">无需主动领取</option><option value="required-not-claimed">需要领取但尚未领取</option><option value="claimed">已领取</option><option value="expired">已超过领奖期限</option></select></label></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="报价/规则来源" value={source} onChange={setSource} placeholder="活动页、App 或证据来源" /><Field label="查询时间" type="datetime-local" value={quotedAt} onChange={setQuotedAt} /></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="放弃的其他权益价值（元）" value={foregone} onChange={setForegone} /><label className="text-sm font-bold text-brand-deep">奖励到账状态<select className={fieldClass} value={rewardStatus} onChange={(event) => setRewardStatus(event.target.value)}><option value="pending">尚未确认到账</option><option value="not-issued">尚未发放</option><option value="issued">已人工确认到账</option></select></label></div>
    {associatedPromotion && <Notice>关联活动：{context?.promotion.title ?? associatedPromotion}。门槛输入仅支持金额；间夜等非金额条件、次数和领奖要求须人工核对，确认资格后才估算奖励。{contextMessage || (!context ? "正在读取当前公开规则和证据。" : context.ruleApplicability?.status === "usable" ? "当前规则具有官方核实依据；资格、消费和增量成本仍需自行确认。" : "当前依据尚不足以确认规则适用，计算仅使用你填写的参数。")}</Notice>}
    {result ? <div className="mt-6"><div className="grid gap-3 sm:grid-cols-3"><MoneyResult label="是否满足已知门槛" value={result.eligibility === "meets-known-conditions" ? "是" : result.eligibility === "fails-known-conditions" ? "否" : "待确认"} /><MoneyResult label="预计奖励价值" value={`¥${formatMicros(result.rewardValueMicros)}`} /><MoneyResult label="估算净增量价值" value={`¥${formatMicros(result.netIncrementalValueMicros)}`} /></div><div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 p-5"><p className="text-sm font-bold text-brand-deep">预计奖励：{result.rewardPoints.toString()} 分；增量成本：{money(result.incrementalCostMinor)}；放弃权益：{money(result.foregoneValueMinor)}</p>{result.warnings.map((warning) => <p key={warning} className="mt-2 text-sm leading-6 text-amber-800">{warning}</p>)}</div><Explain formula={result.formula} reasons={[]} /><SaveScenarioButton calculatorType="activity-reward" context={context} contextPending={Boolean(associatedPromotion && !context && !contextMessage)} contextError={contextMessage} inputSnapshot={{ threshold, qualifying, planned, extra, rewardPoints, pointValue, extraCost, foregone, fee, used, limit, claimStatus, qualificationStatus, rewardStatus, initialReward, promotionRef: associatedPromotion, quotedAt, quotedAtIso: quoteInstant(quotedAt, restored), source }} result={result} quotedAt={quotedAt} quoteSource={source} pointValueMicros={parsePointValue(pointValue)} /></div> : <Notice>请输入合法的非负金额、积分和次数。预计积分不会被描述为已兑现现金收益。</Notice>}
  </Panel>;
}


function Explain({ formula, reasons }: { formula: string; reasons: string[] }) { return <details className="mt-4 rounded-2xl border border-line p-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-brand-deep"><Info size={16} />查看公式、假设和限制</summary><p className="mt-3 text-sm leading-6 text-muted">{formula}</p>{reasons.length > 0 && <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-800">{reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}</details>; }

function SaveScenarioButton({ calculatorType, inputSnapshot, result, quotedAt, quoteSource, pointValueMicros, context, contextPending, contextError }: { calculatorType: CalculatorType; inputSnapshot: Record<string, unknown>; result: Record<string, unknown>; quotedAt?: string; quoteSource?: string; pointValueMicros?: bigint | null; context?: PromotionContext | null; contextPending?: boolean; contextError?: string }) {
  const pending = useRef<{ fingerprint: string; body: string } | null>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [message, setMessage] = useState("");
  const fingerprint = jsonSnapshot({ calculatorType, inputSnapshot, result, context });
  const saved = fingerprint === savedFingerprint;
  async function save() {
    if (submitting.current || saved) return;
    submitting.current = true; setBusy(true); setMessage("");
    try {
      if (!pending.current || pending.current.fingerprint !== fingerprint) {
        const name = window.prompt("方案名称", calculatorType === "rate-comparison" ? "房价比较方案" : calculatorType === "offer-comparison" ? "优惠组合方案" : "活动回报方案");
        if (!name?.trim()) return;
        if (name.trim().length > 160) throw new Error("方案名称最多 160 个字符");
        const profileResponse = await fetch("/api/personal/summary", { cache: "no-store" });
        if (!profileResponse.ok) throw new Error(profileResponse.status === 401 ? "请先登录 Owner 账户，再保存方案。" : "无法读取会员资料，请稍后重试。");
        const profile = await profileResponse.json() as { wallets: Array<{ wallet: Record<string, unknown>; program: { id: string; code: string; name: string } }> };
        const calculatedAt = new Date().toISOString();
        const assumptions = ["现金、积分数量及资格由 Owner 人工填写，未连接或验证锦江官方账户。", "积分估值为个人假设，不等同于已兑现现金收益。"];
        const unresolved = [...(Array.isArray(result.reasons) ? result.reasons : []), ...(Array.isArray(result.warnings) ? result.warnings : [])].filter((item): item is string => typeof item === "string");
        if (!quotedAt) unresolved.push("未登记报价或查询时间。");
        if (!quoteSource?.trim()) unresolved.push("未登记报价或规则来源。");
        if (calculatorType === "rate-comparison") assumptions.push("房价输入已包含必要税费；报价权益的可比性按原始输入判断。");
        if (calculatorType === "offer-comparison") {
          assumptions.push(inputSnapshot.sameRights ? "Owner 声明两种报价的重要权益相同。" : "两种报价的重要权益尚未确认相同。");
          assumptions.push("叠加关系及资格由 Owner 填写，叠加模拟与最终报价分别保存。");
          const stack = result.stacking as { warnings?: string[]; status?: string } | null;
          if (stack?.warnings) unresolved.push(...stack.warnings);
          if (stack?.status !== "verified-usable") unresolved.push("叠加组合未被确认为可实际使用。");
        }
        if (calculatorType === "activity-reward") assumptions.push("使用固定积分奖励模型；原计划消费不计为额外参与成本，额外成本及放弃权益以填写金额为准。", "此计算不会修改积分资产；已领取与奖励到账分别记录。");
        const ruleSnapshots: Record<string, unknown>[] = [{ kind: "calculation-formula", version: "travelwise-phase4-v1", formula: result.formula, capturedAt: calculatedAt }];
        const ruleVersionIds: string[] = [];
        let basis = context;
        if (!basis && typeof inputSnapshot.promotionRef === "string" && inputSnapshot.promotionRef) {
          const response = await fetch(`/calculate/context?promotion=${encodeURIComponent(inputSnapshot.promotionRef)}`, { cache: "no-store" });
          if (!response.ok) throw new Error("关联活动当前不可公开，请重新核对后保存。");
          basis = await response.json() as PromotionContext;
        }
        if (basis) {
          const promotion = basis.promotion;
          ruleVersionIds.push(...new Set([...(promotion.ruleVersion ? [promotion.ruleVersion.id] : []), ...promotion.linkedRules.map((r) => r.id)]));
          ruleSnapshots.push({ kind: "public-activity-basis", capturedAt: calculatedAt, promotionId: promotion.id, slug: promotion.slug, title: promotion.title, updatedAt: promotion.updatedAt, history: promotion.history, isDemo: promotion.isDemo, verificationStatus: promotion.verificationStatus, eligibility: promotion.eligibility, dates: promotion.dates, rewardType: promotion.rewardType, rewardAmount: promotion.rewardAmount, rewardUnit: promotion.rewardUnit, ruleVersion: promotion.ruleVersion, linkedRules: promotion.linkedRules, evidence: promotion.evidence, ruleApplicability: basis.ruleApplicability });
          if (promotion.isDemo) unresolved.push("关联的是 DEMO 活动，不能作为真实官方奖励依据。");
          if (!promotion.ruleVersion) unresolved.push("关联活动没有公开规则版本。");
          if (basis.ruleApplicability?.status !== "usable") unresolved.push(...(basis.ruleApplicability?.reasons ?? ["关联规则尚无可用的官方核实依据。"]));
          if (calculatorType === "activity-reward" && promotion.rewardUnit?.includes("积分") && promotion.rewardAmount && promotion.rewardAmount !== inputSnapshot.rewardPoints) unresolved.push(`手动奖励积分与当前活动参数不同：输入 ${String(inputSnapshot.rewardPoints)} 分，活动记录 ${promotion.rewardAmount} 分。`);
          assumptions.push("活动规则与来源按此次计算时的公开版本冻结；关联规则不是官方账户资格验证。");
        } else {
          assumptions.push("未应用外部官方规则版本，计算仅依据人工输入与所列公式。");
          if (contextError) unresolved.push(contextError);
        }
        const body = jsonSnapshot({ name: name.trim(), calculatorType, inputSnapshot: { ...inputSnapshot, quotedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, quotedAt: typeof inputSnapshot.quotedAtIso === "string" ? inputSnapshot.quotedAtIso : quotedAt ? new Date(quotedAt).toISOString() : null, quoteSource: quoteSource?.trim() || null, pointValueMicros: pointValueMicros?.toString() ?? null, ruleVersionIds, ruleSnapshots, membershipSnapshot: { capturedAt: calculatedAt, verification: "owner-reported", memberships: profile.wallets.map(({ wallet, program }) => ({ programId: program.id, programCode: program.code, membershipTier: wallet.membershipTier, tierExpiresAt: wallet.tierExpiresAt, cardHeld: wallet.cardHeld, cardType: wallet.cardType, benefits: wallet.benefits, lastVerifiedAt: wallet.lastVerifiedAt })) }, result: { ...result, calculatedAt }, assumptions, unresolved: [...new Set(unresolved)], idempotencyKey: window.crypto.randomUUID() });
        pending.current = { fingerprint, body };
      }
      const response = await fetch("/api/personal/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: pending.current.body });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(response.status === 401 ? "请先登录 Owner 账户，再保存方案。" : typeof failure.error === "string" ? failure.error : "保存失败，可再次点击重试。"); }
      setSavedFingerprint(fingerprint); setMessage("已保存原始输入、估值、计算结果和依据。修改输入后可另存新方案。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，可再次点击重试。"); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="mt-4"><button onClick={save} disabled={busy || saved || contextPending} className="focus-ring rounded-xl border border-brand px-4 py-2 text-sm font-bold text-brand disabled:opacity-60">{busy ? "正在保存…" : saved ? "方案已保存" : contextPending ? "正在载入规则…" : "保存当前方案"}</button>{message && <p role="status" className="mt-2 text-sm leading-6 text-muted">{message} <Link href="/me/records#decisions" className="font-bold text-brand underline">查看我的决策</Link></p>}</div>;
}
