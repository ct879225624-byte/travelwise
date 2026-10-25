import { CalculatorCenter } from "../calculator-center";

export default async function RewardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reward = typeof params.reward === "string" && /^\d{1,15}$/.test(params.reward) ? params.reward : undefined;
  const promotion = typeof params.promotion === "string" && params.promotion.length <= 120 ? params.promotion : undefined;
  return <CalculatorCenter only="rewards" initialReward={reward} promotionRef={promotion} />;
}
