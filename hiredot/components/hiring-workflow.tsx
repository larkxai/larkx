"use client";

import { useState, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode,
  EdgeLabelRenderer,
  BaseEdge,
  getStraightPath,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StageDetails } from "./stage-details";
import { workflow } from "@/mocks/workflow";
import { WorkflowStep, ComplexCondition } from "@/@types/workflow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Helper function to format conditions for display
const formatConditions = (condition: ComplexCondition): string => {
  return condition.conditions
    .map((c) => {
      if ("logic" in c) {
        return formatConditions(c);
      }
      return `${c.field} ${c.operator} ${c.value}`;
    })
    .join(` ${condition.logic} `);
};

const initialNodes: Node[] = workflow.steps.map(
  (step: WorkflowStep, index: number) => ({
    id: step.id,
    position: {
      x: index * 250,
      y: 100,
    },
    data: {
      label: step.name,
      ...step,
    },
    type: "default",
  })
);

const initialEdges: Edge[] = workflow.steps.reduce(
  (edges: Edge[], step: WorkflowStep) => {
    const newEdges: Edge[] = [];

    // Handle default next step
    if (step.nextSteps.default) {
      newEdges.push({
        id: `e${step.id}-${step.nextSteps.default}`,
        source: step.id,
        target: step.nextSteps.default,
        animated: true,
        type: "custom",
        data: {
          action: "Default",
          trigger: "No conditions",
        },
      });
    }

    // Handle conditional next steps
    if (step.nextSteps.conditions) {
      step.nextSteps.conditions.forEach((condition) => {
        const targets = Array.isArray(condition.then)
          ? condition.then
          : [condition.then];
        targets.forEach((target) => {
          newEdges.push({
            id: `e${step.id}-${target}`,
            source: step.id,
            target: target,
            animated: true,
            type: "custom",
            data: {
              action: `Priority: ${condition.priority || "Default"}`,
              trigger: formatConditions(condition.condition),
            },
          });
        });
      });
    }

    return [...edges, ...newEdges];
  },
  []
);

// Custom edge component remains the same
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style = {},
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: {
    action?: string;
    trigger?: string;
  };
  style?: React.CSSProperties;
}) => {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: "#f0f0f0",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            border: "1px solid #ccc",
          }}
          className="nodrag nopan"
        >
          <div>{data?.action}</div>
          <div className="text-xs text-gray-500">{data?.trigger}</div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export function EnhancedHiringWorkflowComponent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isGraphMode, setIsGraphMode] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsDialogOpen(true);
  }, []);

  const edgeTypes = {
    custom: CustomEdge,
  };

  const renderLinearView = () => (
    <div className="space-y-4 overflow-y-auto h-[calc(100vh-200px)] pr-4">
      {nodes.map((node) => (
        <Card key={node.id} className="p-4">
          <h3 className="text-lg font-semibold mb-2">{node.data.label}</h3>
          <div className="text-sm text-gray-600">
            <p>Type: {node.data.type}</p>
            <p>Version: {node.data.version}</p>

            {node.data.metadata && (
              <div className="mt-2">
                <p className="font-medium">Metadata:</p>
                <p>{node.data.metadata.description}</p>
                {node.data.metadata.tags && (
                  <div className="flex gap-1 mt-1">
                    {node.data.metadata.tags.map((tag: string) => (
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

            {node.data.nextSteps.conditions && (
              <div className="mt-2">
                <p className="font-medium">Conditions:</p>
                <ul className="list-disc list-inside">
                  {node.data.nextSteps.conditions.map(
                    (condition: any, i: number) => (
                      <li key={i}>
                        {formatConditions(condition.condition)} →{" "}
                        {condition.then}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-1rem)] relative">
      <div className="flex-1 p-4">
        <Card className="w-full h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Hiring Workflow</CardTitle>
              <CardDescription>
                Standard workflow for hiring process
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="mode-switch"
                checked={isGraphMode}
                onCheckedChange={setIsGraphMode}
              />
              <Label htmlFor="mode-switch">
                {isGraphMode ? "Graph" : "Linear"} Mode
              </Label>
            </div>
          </CardHeader>
          <CardContent>
            {isGraphMode ? (
              <div className="h-[calc(100vh-200px)] border rounded-md">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  connectionMode={ConnectionMode.Loose}
                  edgeTypes={edgeTypes}
                  fitView
                >
                  <Background />
                  <Controls />
                </ReactFlow>
              </div>
            ) : (
              renderLinearView()
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {selectedNode && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedNode.data.label}</DialogTitle>
            </DialogHeader>
            <StageDetails node={selectedNode} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
