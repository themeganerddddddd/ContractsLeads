from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta

from dotenv import load_dotenv

from .repository import IntelligenceRepository
from .service import IntelligenceService
from .change_service import ChangeIntelligenceService, MODEL_TYPES, COMPANY_HORIZONS, FORMATION_HORIZONS


def database_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
    return value


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Explainable procurement intelligence")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("train", "backtest"):
        train = subparsers.add_parser(command)
        train.add_argument("--type", choices=("new_award", "contract_change"), required=True)
        train.add_argument("--training-end", type=date.fromisoformat)
        train.add_argument("--validation-end", type=date.fromisoformat)
        train.add_argument("--test-end", type=date.fromisoformat)
        train.add_argument("--horizon", type=int, choices=(30, 60, 90), default=90)
    predict = subparsers.add_parser("predict")
    predict.add_argument("--type", choices=("new_award", "contract_change"), required=True)
    predict.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    predict.add_argument("--horizons", default="30,60,90")
    momentum = subparsers.add_parser("momentum")
    momentum.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    change = subparsers.add_parser("change-backtest")
    change.add_argument("--type", choices=sorted(MODEL_TYPES), required=True)
    change.add_argument("--training-end", type=date.fromisoformat)
    change.add_argument("--validation-end", type=date.fromisoformat)
    change.add_argument("--test-end", type=date.fromisoformat)
    change.add_argument("--horizon", type=int, required=True)
    args = parser.parse_args()

    repository = IntelligenceRepository(database_url())
    try:
        service = IntelligenceService(repository)
        if args.command in {"train", "backtest"}:
            _, observed_end = repository.event_bounds()
            test_end = args.test_end or observed_end or date.today()
            validation_end = args.validation_end or (test_end - timedelta(days=180))
            training_end = args.training_end or (validation_end - timedelta(days=90))
            result = service.train_backtest(
                args.type,
                training_end=training_end,
                validation_end=validation_end,
                test_end=test_end,
                horizon=args.horizon,
            )
        elif args.command == "predict":
            horizons = [int(value) for value in args.horizons.split(",")]
            if not horizons or any(horizon not in {30, 60, 90} for horizon in horizons):
                raise ValueError("horizons must be a comma-separated subset of 30,60,90")
            result = service.predict(args.type, args.as_of, horizons)
        elif args.command == "momentum":
            result = service.momentum(args.as_of)
        else:
            allowed = FORMATION_HORIZONS if args.type == "business_formation" else COMPANY_HORIZONS
            if args.horizon not in allowed:
                raise ValueError(f"unsupported horizon for {args.type}: expected one of {sorted(allowed)}")
            test_end = args.test_end or date.today()
            validation_end = args.validation_end or (test_end - timedelta(days=180))
            training_end = args.training_end or (validation_end - timedelta(days=180))
            result = ChangeIntelligenceService(repository).backtest(
                args.type, training_end=training_end, validation_end=validation_end,
                test_end=test_end, horizon=args.horizon,
            )
        print(json.dumps(result, indent=2, default=str))
        return 0
    finally:
        repository.close()


if __name__ == "__main__":
    raise SystemExit(main())
