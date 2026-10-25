import { CalculatorCenter } from "../calculator-center";

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ promotion?: string }> }) {
  const { promotion } = await searchParams;
  return <CalculatorCenter only="rates" promotionRef={typeof promotion === "string" && promotion.length <= 120 ? promotion : undefined} />;
}
