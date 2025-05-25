"use client";

import React from 'react';
import ReactFlow, { 
  Node, 
  Edge, 
  Background, 
  Controls,
  NodeTypes,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

interface AgentNode {
  id: string;
  type: string;
  order: number;
  config: Record<string, unknown>;
  isPassive?: boolean;
  after?: string;
}

interface AgentGraphProps {
  agents: AgentNode[];
  onNodeClick?: (node: AgentNode) => void;
}

const AgentNode: React.FC<{ data: AgentNode }> = ({ data }) => {
  const { type, isPassive } = data;
  
  return (
    <div className={`p-4 rounded-lg border-2 ${
      isPassive ? 'border-dashed border-gray-400' : 'border-solid border-blue-500'
    } bg-white shadow-md`}>
      <div className="font-semibold">{type}</div>
      {isPassive && (
        <div className="text-xs text-gray-500 mt-1">Passive Agent</div>
      )}
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

    // Create edges based on 'after' property
    const newEdges: Edge[] = agents
      .filter(agent => agent.after)
      .map((agent, index) => ({
        id: `e${index}`,
        source: agent.after as string,
        target: agent.id,
        type: 'smoothstep',
      }));

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