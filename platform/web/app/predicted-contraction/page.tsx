import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Predicted Contraction",
  description: "Source-backed company contraction signals that do not treat a lone deobligation as proof.",
};

export default function PredictedContractionPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <PredictionScreener kind="contraction" searchParams={searchParams} />;
}

