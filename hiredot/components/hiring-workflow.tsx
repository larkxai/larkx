"use client"

import { useState, useCallback } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { StageDetails } from './stage-details'

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 100 }, data: { label: 'Application Form' } },
  { id: '2', position: { x: 250, y: 0 }, data: { label: 'Initial Evaluation' } },
  { id: '3', position: { x: 500, y: 100 }, data: { label: 'Interview' } },
  { id: '4', position: { x: 750, y: 100 }, data: { label: 'Offer' } },
  { id: '5', position: { x: 250, y: 200 }, data: { label: 'Rejection' } },
]

const initialEdges: Edge[] = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    animated: true, 
    type: 'custom',
    data: { 
      action: 'Submit',
      condition: 'Form Complete'
    }
  },
  { 
    id: 'e2-3', 
    source: '2', 
    target: '3', 
    animated: true, 
    type: 'custom',
    data: { 
      action: 'Approve',
      condition: 'Score > 7'
    }
  },
  { 
    id: 'e2-5', 
    source: '2', 
    target: '5', 
    animated: true, 
    type: 'custom',
    data: { 
      action: 'Reject',
      condition: 'Score < 4'
    }
  },
  { id: 'e3-4', source: '3', target: '4', animated: true, label: 'Pass' },
  { id: 'e3-5', source: '3', target: '5', animated: true, label: 'Fail' },
]

// Add a custom edge type
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style = {},
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
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: '#f0f0f0',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            border: '1px solid #ccc',
          }}
          className="nodrag nopan"
        >
          <div>{data?.action}</div>
          <div className="text-xs text-gray-500">{data?.condition}</div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export function EnhancedHiringWorkflowComponent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isGraphMode, setIsGraphMode] = useState(true)

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  // Add the custom edge type to the nodeTypes object
  const edgeTypes = {
    custom: CustomEdge,
  };

  return (
    <div className="flex h-[calc(100vh-1rem)] relative">
      <div className="flex-1 p-4">
        <Card className="w-full h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Hiring Workflow</CardTitle>
              <CardDescription>Interactive visualization of the hiring process</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="mode-switch"
                checked={isGraphMode}
                onCheckedChange={setIsGraphMode}
              />
              <Label htmlFor="mode-switch">{isGraphMode ? 'Graph' : 'Linear'} Mode</Label>
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
              <div className="space-y-4 overflow-y-auto h-[calc(100vh-200px)] pr-4">
                {nodes.map((node) => (
                  <Card key={node.id} className="p-4">
                    <h3 className="text-lg font-semibold mb-2">{node.data.label}</h3>
                    <StageDetails node={node} />
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {isGraphMode && selectedNode && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <StageDetails 
            node={selectedNode} 
            trigger={<Button>View {selectedNode.data.label} Stage</Button>} 
          />
        </div>
      )}
    </div>
  )
}