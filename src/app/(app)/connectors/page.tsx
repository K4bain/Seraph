import { listConnectors } from "seraph-connector-sdk/runtime";
import "../../../connectors";
import ConnectorRunPanel from "@/components/connectors/ConnectorRunPanel";

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
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Connectors</h1>
          <p className="page-subtitle">
            OpenSanctions, GDELT, SEC EDGAR and the connector SDK.
          </p>
        </div>
      </header>
      <ConnectorRunPanel connectors={connectors} />
    </div>
  );
}
