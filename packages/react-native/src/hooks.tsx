import { useEffect, useState } from "react";

import type { Engine, ExecutionEventRecord, RunSnapshot, StepSnapshot } from "@larkx/core";

export interface WorkflowObservation {
  readonly run: RunSnapshot | null;
  readonly steps: StepSnapshot[];
  readonly history: ExecutionEventRecord[];
}

const EMPTY: WorkflowObservation = { run: null, steps: [], history: [] };

/**
 * Read a run for display. Unmounting the component does not cancel or release the run.
 */
export function useLarkxRun(engine: Engine | null, runId: string | null): WorkflowObservation {
  const [observation, setObservation] = useState<WorkflowObservation>(EMPTY);
  useEffect(() => {
    if (engine === null || runId === null) {
      setObservation(EMPTY);
      return;
    }
    let cancelled = false;
    const refresh = (): void => {
      void Promise.all([engine.getRun(runId), engine.getSteps(runId), engine.getHistory(runId)])
        .then(([run, steps, history]) => {
          if (!cancelled) {
            setObservation({ run, steps, history });
          }
        })
        .catch(() => {
          // A closed engine or a missing run should leave the last observation in place.
        });
    };
    refresh();
    const unsubscribe = engine.subscribe(runId, () => {
      refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [engine, runId]);
  return observation;
}
