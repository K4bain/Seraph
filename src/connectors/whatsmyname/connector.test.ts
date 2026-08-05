import type { Mock } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckUri,
  decideSite,
  stripAccount,
  whatsmynameConnector,
} from "@/connectors/whatsmyname/connector";

const USERA = {
  name: "GitLab",
  uri_check: "https://gitlab.com/api/v4/users?username={account}",
  uri_pretty: "https://gitlab.com/{account}",
  e_code: 200,
  e_string: '"id":',
  m_code: 200,
  m_string: "[]",
  cat: "coding",
};

const USERB = {
  name: "Bandcamp",
  uri_check: "https://bandcamp.com/{account}",
  e_code: 200,
  e_string: "collection",
  m_code: 404,
  m_string: "Sorry, that something isn’t here.",
  cat: "music",
};

const DATA_URL = whatsmynameConnector.config.dataUrl as string;

describe("whatsmyname helpers", () => {
  it("buildCheckUri substitutes the account into any template field", () => {
    expect(buildCheckUri(USERA, "blue")).toBe("https://gitlab.com/api/v4/users?username=blue");
    expect(buildCheckUri({ uri_construction: "https://github.com/{account}" }, "a b")).toBe(
      "https://github.com/a%20b",
    );
  });

  it("buildCheckUri applies per-site strip_bad_char", () => {
    expect(buildCheckUri({ uri_check: "https://{account}.tumblr.com", strip_bad_char: "." }, "blue.")).toBe(
      "https://blue.tumblr.com",
    );
  });

  it("stripAccount removes listed characters only", () => {
    expect(stripAccount({ strip_bad_char: ".-" }, "a.b-c")).toBe("abc");
    expect(stripAccount({}, "plain")).toBe("plain");
  });

  it("decideSite flags an existing account from e_code + e_string", () => {
    expect(decideSite(200, '{"id":123,"username":"blue"}', USERA)).toBe(true);
    expect(decideSite(200, '<div>collection</div>', USERB)).toBe(true);
  });

  it("decideSite flags a missing account from m_code or m_string", () => {
    expect(decideSite(200, "[]", USERA)).toBe(false);
    expect(decideSite(404, "<h2>Sorry, that something isn’t here.</h2>", USERB)).toBe(false);
  });

  it("decideSite returns null when neither signature matches", () => {
    expect(decideSite(503, "<html>maintenance</html>", USERB)).toBeNull();
  });
});

describe("whatsmyname search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(routes: Record<string, { status: number; body: string }>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === DATA_URL) {
          return new Response(JSON.stringify({ sites: [USERA, USERB] }), { status: 200 });
        }
        const hit = routes[url];
        if (!hit) return new Response("not routed", { status: 404 });
        return new Response(hit.body, { status: hit.status });
      }),
    );
  }

  it("returns matching platforms for an existing username", async () => {
    stubFetch({
      "https://gitlab.com/api/v4/users?username=blue": { status: 200, body: '{"id":1,"username":"blue"}' },
      "https://bandcamp.com/blue": { status: 200, body: '<title>blue</title><div>collection</div>' },
    });

    const { results } = await whatsmynameConnector.search!({ query: "blue" });
    expect(results.map((r) => r.metadata?.site).sort()).toEqual(["Bandcamp", "GitLab"]);
    const bandcamp = results.find((r) => r.metadata?.site === "Bandcamp");
    expect(bandcamp?.source).toBe("Whatsmyname");
    expect(bandcamp?.entityType).toBe("person");
    expect(bandcamp?.url).toBe("https://bandcamp.com/blue");
  });

  it("returns no hits when every platform signals missing", async () => {
    stubFetch({
      "https://gitlab.com/api/v4/users?username=nope": { status: 200, body: "[]" },
      "https://bandcamp.com/nope": { status: 404, body: "<h2>Sorry, that something isn’t here.</h2>" },
    });

    const { results } = await whatsmynameConnector.search!({ query: "nope" });
    expect(results).toEqual([]);
  });

  it("tolerates a site that times out without failing the query", async () => {
    const failing: Mock<typeof fetch> = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", failing);
    failing.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === DATA_URL) {
        return new Response(JSON.stringify({ sites: [USERA] }), { status: 200 });
      }
      throw new Error("network down");
    });

    const { results } = await whatsmynameConnector.search!({ query: "blue" });
    expect(results).toEqual([]);
  });

  it("treats a non-username-shaped query as an empty result", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { results } = await whatsmynameConnector.search!({ query: "John Smith" });
    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
