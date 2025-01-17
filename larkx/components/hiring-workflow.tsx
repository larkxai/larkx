"use client";

import { useState, useCallback, useEffect } from "react";
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
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StageDetails } from "./stage-details";
import { workflow } from "@/mocks/workflow";
import { WorkflowStep, ComplexCondition, Workflow } from "@/@types/workflow";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";
import dagre from 'dagre';
import { NodeData, WorkflowSpotlight } from "./workflow-spotlight";
import { cn } from "@/lib/utils";

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

function HiringWorkflowComponent({ workflow, onSave }: { workflow: Workflow; onSave: (workflow: Workflow) => void }) {
  const { getZoom, getViewport, getNodes, setViewport, setCenter } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Node dimensions for centering
  const NODE_WIDTH = 250;
  const NODE_HEIGHT = 100;

  // Update center node function to use fixed zoom
  const centerNode = useCallback((node: Node) => {
    setCenter(
      node.position.x + (node.width || NODE_WIDTH) / 2,
      node.position.y + (node.height || NODE_HEIGHT) / 2,
      { 
        duration: 800,
        zoom: 1.5
      }
    );
  }, [setCenter]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const edgeTypes = {
    custom: CustomEdge,
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderHierarchyNode = (node: Node, level: number = 0) => {
    const hasChildren = edges.some(edge => edge.source === node.id);
    const isExpanded = expandedNodes.has(node.id);
    const childNodes = edges
      .filter(edge => edge.source === node.id)
      .map(edge => nodes.find(n => n.id === edge.target))
      .filter(Boolean) as Node[];

    return (
      <div key={node.id} className="text-sm">
        <div
          className={cn(
            "flex items-center py-1 px-2 hover:bg-gray-100 rounded cursor-pointer",
            selectedNode?.id === node.id && "bg-gray-100"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            setSelectedNode(node);
            centerNode(node);
          }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeExpansion(node.id);
              }}
              className="mr-1 p-1 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          <span>{node.data.label}</span>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {childNodes.map(childNode => renderHierarchyNode(childNode, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = nodes.filter(node => 
    !edges.some(edge => edge.target === node.id)
  );

  const handleFormat = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
  }, [nodes, edges, setNodes, setEdges]);

  const handleAddNode = useCallback((nodeDetails: NodeData) => {
    const newNode: Node<NodeData> = {
      id: nodeDetails.id,
      position: { x: 0, y: 0 }, // Position will be set by handleFormat
      data: nodeDetails,
      type: 'default',
      style: nodeStyles
    };
    setNodes((nodes) => [...nodes, newNode]);
    handleFormat();
  }, [setNodes, handleFormat]);

  const saveVisualState = useCallback(() => {
    const zoom = getZoom();
    const { x, y } = getViewport();
    const nodes = getNodes();
    
    const nodePositions = nodes.reduce((acc, node) => ({
      ...acc,
      [node.id]: { x: node.position.x, y: node.position.y }
    }), {});

    const visualState = {
      zoom,
      position: { x, y },
      nodePositions
    };

    onSave({ ...workflow, visualState });
  }, [workflow, getZoom, getViewport, getNodes, onSave]);

  useEffect(() => {
    if (workflow.visualState) {
      const { zoom, position, nodePositions } = workflow.visualState;
      
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          position: nodePositions[node.id] || node.position
        }))
      );

      setViewport({ x: position.x, y: position.y, zoom });
    }
  }, [workflow.visualState, setNodes, setViewport]);

  const handleNodeDragStop = useCallback(() => {
    saveVisualState();
  }, [saveVisualState]);

  return (
    <div className="flex h-[calc(100vh-1rem)] gap-4">
      {/* Left Panel - Hierarchy */}
      <Card className="w-64 overflow-hidden flex flex-col">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Workflow Hierarchy</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-2">
          {rootNodes.map(node => renderHierarchyNode(node))}
        </CardContent>
      </Card>

      {/* Center Panel - Graph */}
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <div>
            <CardTitle>Workflow Graph</CardTitle>
            <CardDescription>
              Standard workflow for hiring process
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleFormat}
          >
            Format Graph
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[calc(100vh-8rem)] border rounded-md">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNode(node)}
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
              onNodeDragStop={handleNodeDragStop}
              onMoveEnd={saveVisualState}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {/* Right Panel - Properties */}
      <Card className="w-80 overflow-hidden flex flex-col">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Properties</CardTitle>
          <CardDescription>
            {selectedNode ? selectedNode.data.label : "Select a node to view details"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {selectedNode ? (
            <StageDetails node={selectedNode} />
          ) : (
            <div className="text-sm text-gray-500 p-4">
              Click on a node in the graph or hierarchy to view its properties
            </div>
          )}
        </CardContent>
      </Card>

      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <WorkflowSpotlight onAddNode={handleAddNode} />
      </div>
    </div>
  );
}

export function EnhancedHiringWorkflowComponent({ workflow, onSave }: { workflow: Workflow; onSave: (workflow: Workflow) => void }) {
  return (
    <ReactFlowProvider>
      <HiringWorkflowComponent workflow={workflow} onSave={onSave} />
    </ReactFlowProvider>
  );
}
