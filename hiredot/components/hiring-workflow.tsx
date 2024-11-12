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
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { StageDetails } from './stage-details'
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { X } from "lucide-react"
import { type StageData } from '@/mocks/candidates'

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 100 }, data: { label: 'Application Form' } },
  { id: '2', position: { x: 250, y: 0 }, data: { label: 'Initial Evaluation' } },
  { id: '3', position: { x: 500, y: 100 }, data: { label: 'Interview' } },
  { id: '4', position: { x: 750, y: 100 }, data: { label: 'Offer' } },
  { id: '5', position: { x: 250, y: 200 }, data: { label: 'Rejection' } },
]

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, label: 'Submit' },
  { id: 'e2-3', source: '2', target: '3', animated: true, label: 'Approve' },
  { id: 'e2-5', source: '2', target: '5', animated: true, label: 'Reject' },
  { id: 'e3-4', source: '3', target: '4', animated: true, label: 'Pass' },
  { id: 'e3-5', source: '3', target: '5', animated: true, label: 'Fail' },
]

function TagManager({ tags, onAddTag, onRemoveTag }: {
  tags: string[]
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
}) {
  const [newTag, setNewTag] = useState('')

  const handleAddTag = () => {
    if (newTag.trim()) {
      onAddTag(newTag.trim())
      setNewTag('')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add new tag..."
          onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
        />
        <Button onClick={handleAddTag}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} className="flex items-center gap-1">
            {tag}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => onRemoveTag(tag)}
            />
          </Badge>
        ))}
      </div>
    </div>
  )
}

function StageDataDisplay({ stageData }: { stageData: StageData }) {
  if (!stageData) return null;

  return (
    <div className="mt-4">
      {stageData.applicationForm && (
        <div className="space-y-2">
          <h4 className="font-semibold">Application Form Details</h4>
          <p>Submitted: {stageData.applicationForm.submissionDate.toLocaleDateString()}</p>
          <p>Completed Fields: {stageData.applicationForm.completedFields.join(', ')}</p>
          <p>Attachments: {stageData.applicationForm.attachments.join(', ')}</p>
        </div>
      )}
      {stageData.initialEvaluation && (
        <div className="space-y-2">
          <h4 className="font-semibold">Initial Evaluation</h4>
          <p>Evaluator: {stageData.initialEvaluation.evaluator}</p>
          <div>
            Skills Assessment:
            {Object.entries(stageData.initialEvaluation.skillAssessment).map(([skill, score]) => (
              <div key={skill}>{skill}: {score}/5</div>
            ))}
          </div>
        </div>
      )}
      {/* Add similar sections for interview and offer data */}
    </div>
  )
}

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