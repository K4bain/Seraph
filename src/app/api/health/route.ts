export async function GET() {
  return Response.json({
    ok: true,
    service: "seraph",
    version: "0.1.0",
    time: new Date().toISOString(),
  });
}
