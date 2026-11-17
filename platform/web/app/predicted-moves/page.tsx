import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Predicted Moves",
  description: "Source-backed relocation and footprint-change signals without invented destinations.",
};

export default function PredictedMovesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <PredictionScreener kind="moves" searchParams={searchParams} />;
}

