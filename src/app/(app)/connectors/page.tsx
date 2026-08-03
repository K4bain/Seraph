import { listConnectors } from "seraph-connector-sdk/runtime";
import "../../../connectors";
import ConnectorRunPanel from "@/components/connectors/ConnectorRunPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Cable } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ConnectorsPage() {
  const connectors = listConnectors().map((c) => ({
    id: c.manifest.id,
    name: c.manifest.name,
    version: c.manifest.version,
    description: c.manifest.description,
    entityTypes: c.manifest.entityTypes,
  }));

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        eyebrowIcon={Cable}
        title="Connectors"
        subtitle="OpenSanctions, GDELT, SEC EDGAR and the connector SDK."
      />
      <ConnectorRunPanel connectors={connectors} />
    </div>
  );
}
