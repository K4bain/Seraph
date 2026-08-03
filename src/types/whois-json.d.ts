declare module "whois-json" {
  interface WhoisResult {
    [key: string]: string | string[] | undefined;
  }
  interface WhoisServerResult {
    server: string;
    data: WhoisResult;
  }
  export default function whoisJson(
    domain: string,
    options?: Record<string, unknown>,
  ): Promise<WhoisResult | WhoisServerResult[]>;
}
