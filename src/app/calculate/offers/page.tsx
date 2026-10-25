import { CalculatorCenter } from "../calculator-center";

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ promotion?: string }> }) {
  const { promotion } = await searchParams;
  return <CalculatorCenter only="offers" promotionRef={typeof promotion === "string" && promotion.length <= 120 ? promotion : undefined} />;
}
