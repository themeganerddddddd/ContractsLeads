import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Predicted Expansion",
  description: "Source-backed company expansion signals with calibrated probabilities only when validation gates pass.",
};

export default function PredictedExpansionPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <PredictionScreener kind="expansion" searchParams={searchParams} />;
}

