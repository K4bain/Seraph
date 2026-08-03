import { listConnectors } from "seraph-connector-sdk/runtime";
import "../../../connectors";
import MarketplacePanel, { type MarketplaceConnector } from "@/components/marketplace/MarketplacePanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { ShoppingBag } from "lucide-react";

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
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        eyebrowIcon={ShoppingBag}
        title="Marketplace"
        subtitle="Connector catalog — built-in sources, ready to run against any canvas."
      />
      <MarketplacePanel connectors={connectors} />
    </div>
  );
}
