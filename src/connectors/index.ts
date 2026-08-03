/**
 * Connector registry — assembly point. Importing this module registers
 * every connector with the SDK runtime (`getConnector`/`listConnectors`).
 *
 * The runner worker and the connectors API both import this module, so
 * a connector added here is automatically runnable everywhere.
 */

import { registerConnector } from "seraph-connector-sdk/runtime";
import { gdeltConnector } from "./gdelt/connector";
import { opensanctionsConnector } from "./opensanctions/connector";
import { edgarConnector } from "./edgar/connector";
import { wikidataConnector } from "./wikidata/connector";
import { githubConnector } from "./github/connector";
import { whoisConnector } from "./whois/connector";

registerConnector(gdeltConnector);
registerConnector(opensanctionsConnector);
registerConnector(edgarConnector);
registerConnector(wikidataConnector);
registerConnector(githubConnector);
registerConnector(whoisConnector);

export {
  gdeltConnector,
  opensanctionsConnector,
  edgarConnector,
  wikidataConnector,
  githubConnector,
  whoisConnector,
};
