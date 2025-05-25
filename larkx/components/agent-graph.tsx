"use client";

import React from 'react';
import ReactFlow, { 
  Node, 
  Edge, 
  Background, 
  Controls,
  NodeTypes,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Agent, AgentMode } from '@/@types/agent';

interface AgentGraphProps {
  agents: Agent[];
  onNodeClick?: (node: Agent) => void;
  selectedAgentId?: string | null;
}

const AgentNode: React.FC<NodeProps<Agent>> = ({ data, selected }) => {
  const { name } = data;
  return (
    <div className={`p-4 rounded-lg border-2 transition-colors duration-150 ${
      selected ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'
    } shadow-md relative`}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400"
      />
      <div className="font-semibold">{name}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-400"
      />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

export const AgentGraph: React.FC<AgentGraphProps> = ({ agents, onNodeClick, selectedAgentId }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  React.useEffect(() => {
    const newNodes: Node[] = agents.map((agent, index) => ({
      id: agent.id,
      type: 'agent',
      position: { x: index * 200, y: 0 },
      data: agent,
      selected: agent.id === selectedAgentId,
    }));
    const newEdges: Edge[] = agents
      .filter(agent => agent.mode === AgentMode.Linear && agent.after)
      .map(agent => ({
        id: `e-${agent.after}-${agent.id}`,
        source: agent.after!,
        target: agent.id,
        type: 'smoothstep',
        sourceHandle: 'source',
        targetHandle: 'target',
      }));
    setNodes(newNodes);
    setEdges(newEdges);
  }, [agents, selectedAgentId]);

  return (
    <div className="w-full h-[600px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick?.(node.data)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}; 