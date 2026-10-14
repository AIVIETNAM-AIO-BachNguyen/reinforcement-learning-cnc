import { DecisionCenterPage } from "@/components/pages/decision-center-page";

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ machine?: string }>;
}) {
  const { machine } = await searchParams;
  return (
    <DecisionCenterPage
      initialMachine={typeof machine === "string" ? machine : ""}
    />
  );
}
