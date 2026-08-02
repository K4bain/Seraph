import { listConnectors } from "seraph-connector-sdk/runtime";
import "../../../connectors";
import MarketplacePanel, { type MarketplaceConnector } from "@/components/marketplace/MarketplacePanel";

export const dynamic = "force-dynamic";

export default function MarketplacePage() {
  const connectors: MarketplaceConnector[] = listConnectors().map((c) => ({
    id: c.manifest.id,
    name: c.manifest.name,
    version: c.manifest.version,
    description: c.manifest.description,
    author: c.manifest.author,
    pollIntervalMs: c.manifest.pollIntervalMs,
    webhookSupported: c.manifest.webhookSupported,
    entityTypes: c.manifest.entityTypes,
  }));

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Marketplace</h1>
          <p className="page-subtitle">
            Connector catalog — built-in sources, ready to run against any canvas.
          </p>
        </div>
      </header>
      <MarketplacePanel connectors={connectors} />
    </div>
  );
}
