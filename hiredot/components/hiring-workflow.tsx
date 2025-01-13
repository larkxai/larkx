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
  Position,
  Panel,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import dagre from 'dagre';

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

// Add custom node styles
const nodeStyles = {
  background: '#ffffff',
  padding: 16,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  width: 250,
};

const initialNodes: Node[] = workflow.steps.map((step: WorkflowStep) => ({
  id: step.id,
  position: { x: 0, y: 0 }, // Position will be set by dagre
  data: {
    label: step.name,
    ...step,
  },
  style: nodeStyles,
  type: 'default',
  sourceHandle: Position.Right,
  targetHandle: Position.Left,
}));

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

// Add layout configuration
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 250;
  const nodeHeight = 100;

  dagreGraph.setGraph({
    rankdir: 'TB', // Always vertical (top to bottom)
    align: 'UL',
    nodesep: 80,
    ranksep: 100,
    edgesep: 50,
    marginx: 20,
    marginy: 20
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      sourceHandle: Position.Bottom,
      targetHandle: Position.Top,
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function EnhancedHiringWorkflowComponent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isGraphMode, setIsGraphMode] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
    },
    [setNodes, setEdges]
  );

  const edgeTypes = {
    custom: CustomEdge,
  };

  const renderLinearView = () => (
    <div className="space-y-4 overflow-y-auto h-[calc(100vh-200px)] pr-4">
      {nodes.map((node) => (
        <Card key={node.id} className="p-4 relative">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-semibold mb-2">{node.data.label}</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <path
                      d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                      fill="currentColor"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => handleDelete(node.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsOpen(true);
  }, []);

  // Simplified format handler
  const handleFormat = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
  }, [nodes, edges, setNodes, setEdges]);

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
              {isGraphMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleFormat}
                >
                  Format Graph
                </Button>
              )}
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
                  defaultEdgeOptions={{
                    type: 'custom',
                    animated: true,
                  }}
                  fitView
                  fitViewOptions={{
                    padding: 0.2,
                    minZoom: 0.5,
                    maxZoom: 2,
                  }}
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedNode?.data?.label || "Node Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {/* Add your node details here */}
            <p>Node ID: {selectedNode?.id}</p>
            <p>Node Type: {selectedNode?.type}</p>
            {/* Add more node information as needed */}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
