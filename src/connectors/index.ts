/**
 * Connector registry — assembly point. Importing this module registers
 * every connector with the SDK runtime (`getConnector`/`listConnectors`).
 *
 * The runner worker and the connectors API both import this module, so
 * a connector added here is automatically runnable everywhere.
 */

import { registerConnector } from "meridian-connector-sdk/runtime";
import { gdeltConnector } from "./gdelt/connector";
import { opensanctionsConnector } from "./opensanctions/connector";
import { edgarConnector } from "./edgar/connector";

registerConnector(gdeltConnector);
registerConnector(opensanctionsConnector);
registerConnector(edgarConnector);

export { gdeltConnector, opensanctionsConnector, edgarConnector };
