import GlobeView from "@/components/globe/GlobeView";

export const dynamic = "force-dynamic";

export default async function GlobePage({
  searchParams,
}: {
  searchParams: Promise<{ canvas?: string }>;
}) {
  const { canvas } = await searchParams;
  const canvasId = canvas || "demo";

  return (
    <div className="h-[calc(100dvh-3rem)] w-full overflow-hidden bg-background">
      <GlobeView canvasId={canvasId} />
    </div>
  );
}
