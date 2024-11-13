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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StageDetails } from "./stage-details";
import { mockWorkflows } from "@/mocks/workflow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const initialNodes: Node[] = mockWorkflows[0].steps.map((step, index) => ({
  id: step.id,
  position: {
    x: index * 250,
    y: 100,
  },
  data: {
    label: step.name,
    ...step, // Include all step data
  },
  type: 'default',
}));

const initialEdges: Edge[] = mockWorkflows[0].steps.reduce((edges: Edge[], step, index) => {
  if (step.nextSteps && step.nextSteps.length > 0) {
    const newEdges = step.nextSteps.map((nextStepId) => ({
      id: `e${step.id}-${nextStepId}`,
      source: step.id,
      target: nextStepId,
      animated: true,
      type: 'custom' as const,
      data: {
        action: 'Next',
        trigger: step.conditions.length > 0 
          ? `Conditions: ${step.conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(', ')}`
          : 'No conditions',
      },
    }));
    return [...edges, ...newEdges];
  }
  return edges;
}, []);

// Add a custom edge type
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

  // Add the custom edge type to the nodeTypes object
  const edgeTypes = {
    custom: CustomEdge,
  };

  const renderLinearView = () => (
    <div className="space-y-4 overflow-y-auto h-[calc(100vh-200px)] pr-4">
      {nodes.map((node) => (
        <Card key={node.id} className="p-4">
          <h3 className="text-lg font-semibold mb-2">
            {node.data.label}
          </h3>
          <div className="text-sm text-gray-600">
            <p>Type: {node.data.type}</p>
            {node.data.conditions?.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">Conditions:</p>
                <ul className="list-disc list-inside">
                  {node.data.conditions.map((condition, i) => (
                    <li key={i}>
                      {condition.field} {condition.operator} {condition.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {node.data.form && (
              <div className="mt-2">
                <p className="font-medium">Form: {node.data.form.title}</p>
                <p>{node.data.form.description}</p>
              </div>
            )}
            {node.data.quiz && (
              <div className="mt-2">
                <p className="font-medium">Quiz: {node.data.quiz.title}</p>
                <p>Passing Score: {node.data.quiz.passingScore}%</p>
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
              <CardTitle>{mockWorkflows[0].name}</CardTitle>
              <CardDescription>
                {mockWorkflows[0].description}
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
