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
import { Agent, AgentMode } from '@/@types/agent';

interface AgentGraphProps {
  agents: Agent[];
  onNodeClick?: (node: Agent) => void;
}

const AgentNode: React.FC<{ data: Agent }> = ({ data }) => {
  const { type, mode } = data;
  
  return (
    <div className={`p-4 rounded-lg border-2 ${
      mode === AgentMode.Passive
        ? 'border-dashed border-gray-400'
        : 'border-solid border-blue-500'
    } bg-white shadow-md`}>
      <div className="font-semibold">{type}</div>
      {mode === AgentMode.Passive && (
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

    // Create edges based on order, only for linear agents
    const newEdges: Edge[] = [];
    for (let i = 1; i < agents.length; i++) {
      const currentAgent = agents[i];
      const prevAgent = agents[i - 1];
      if (currentAgent.mode === AgentMode.Linear && prevAgent.mode === AgentMode.Linear) {
        newEdges.push({
          id: `e${i}`,
          source: prevAgent.id,
          target: currentAgent.id,
          type: 'smoothstep',
        });
      }
    }

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