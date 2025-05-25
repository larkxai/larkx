import { Node } from "reactflow";
import {
  WorkflowCondition,
  ComplexCondition,
  WorkflowStep,
} from "@/@types/workflow";

interface StageDetailsProps {
  node: Node;
}

export function StageDetails({ node }: StageDetailsProps) {
  const stageData = node.data as WorkflowStep;

  return (
    <div className="p-4">
      <div className="text-sm text-gray-600">
        <p>Type: {stageData.type}</p>
        <p>Version: {stageData.version}</p>

        {stageData.metadata && (
          <div className="mt-2">
            <p className="font-medium">Metadata:</p>
            <p>{stageData.metadata.description}</p>
            {stageData.metadata.tags && (
              <div className="flex gap-1 mt-1">
                {stageData.metadata.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="bg-gray-100 px-2 py-1 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {stageData.nextSteps.conditions && (
          <div className="mt-2">
            <p className="font-medium">Conditions:</p>
            <ul className="list-disc list-inside">
              {stageData.nextSteps.conditions.map((conditionObj, i) => (
                <li key={i}>
                  {conditionObj.condition.conditions
                    .map(
                      (c: ComplexCondition | WorkflowCondition) =>
                        'field' in c ? `${c.field} ${c.operator} ${c.value}` : ''
                    )
                    .join(` ${conditionObj.condition.logic} `)}
                  {" → "}
                  {Array.isArray(conditionObj.then)
                    ? conditionObj.then.join(", ")
                    : conditionObj.then}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
