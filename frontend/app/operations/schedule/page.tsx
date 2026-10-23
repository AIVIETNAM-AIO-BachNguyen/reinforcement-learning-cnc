import { IntegratedSchedulePage } from "@/components/pages/integrated-schedule-page";
import { getOperationsFactoryId } from "@/lib/operations-api";
import { firstParam, productionMode } from "@/lib/operations-ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ factory_id?: string | string[]; demo?: string | string[]; caseId?: string | string[] }> }) {
  const params = await searchParams;
  return <IntegratedSchedulePage key={JSON.stringify(params)} factoryId={firstParam(params.factory_id) ?? (firstParam(params.caseId) ? undefined : getOperationsFactoryId())} caseId={firstParam(params.caseId)} apiMode={productionMode(params.demo)} />;
}
