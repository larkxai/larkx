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
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Agent, AgentMode } from '@/@types/agent';

interface AgentGraphProps {
  agents: Agent[];
  onNodeClick?: (node: Agent) => void;
}

const AgentNode: React.FC<{ data: Agent }> = ({ data }) => {
  const { name, mode } = data;
  
  return (
    <div className={`p-4 rounded-lg border-2 ${
      mode === AgentMode.Passive
        ? 'border-dashed border-gray-400'
        : 'border-solid border-blue-500'
    } bg-white shadow-md relative`}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400"
      />
      <div className="font-semibold">{name}</div>
      {mode === AgentMode.Passive && (
        <div className="text-xs text-gray-500 mt-1">Passive Agent</div>
      )}
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

export const AgentGraph: React.FC<AgentGraphProps> = ({ agents, onNodeClick }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  React.useEffect(() => {
    // Convert agents to nodes
    const newNodes: Node[] = agents.map((agent, index) => ({
      id: agent.id,
      type: 'agent',
      position: { x: index * 200, y: 0 },
      data: agent,
    }));

    // Create edges based on 'after' field for linear agents
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

    // Debug log
    console.log('AGENTS:', agents);
    console.log('EDGES:', newEdges);

    setNodes(newNodes);
    setEdges(newEdges);
  }, [agents]);

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