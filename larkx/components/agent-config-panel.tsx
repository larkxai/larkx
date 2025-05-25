"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';

interface AgentConfig {
  id: string;
  type: string;
  agentname?: string;
  after?: string | null;
  config: Record<string, unknown>;
  isPassive?: boolean;
}

interface AgentConfigPanelProps {
  agent: AgentConfig | null;
  agents: AgentConfig[];
  onSave: (config: AgentConfig) => void;
  onSelectAgent?: (agent: AgentConfig) => void;
}

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({ agent, agents, onSave, onSelectAgent }) => {
  const [config, setConfig] = React.useState<AgentConfig | null>(agent);

  React.useEffect(() => {
    setConfig(agent);
  }, [agent]);

  if (!config) {
    return (
      <div className="p-4 text-gray-500">
        Select an agent to view its configuration
      </div>
    );
  }

  const connectedAgent = config.after ? agents.find(a => a.id === config.after) : null;

  const handleConfigChange = (key: string, value: unknown) => {
    if (!config) return;
    setConfig({
      ...config,
      config: {
        ...config.config,
        [key]: value,
      },
    });
  };

  const handleSave = () => {
    if (!config) return;
    onSave(config);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Agent Configuration</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <input
              type="text"
              value={config.type}
              disabled
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Agent Name</label>
            <input
              type="text"
              value={config.agentname || ''}
              onChange={e => setConfig({ ...config, agentname: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">After</label>
            <Select
              value={config.after ?? '__start__'}
              onValueChange={(val) => setConfig({ ...config, after: val === '__start__' ? null : val })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Start" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__start__">Start</SelectItem>
                {agents.filter(a => a.id !== config.id).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.agentname || a.type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {connectedAgent && (
            <div className="flex items-end">
              <span className="text-xs text-gray-500 mr-2">Connected to:</span>
              <button
                type="button"
                className="text-blue-600 underline text-xs hover:text-blue-800"
                onClick={() => onSelectAgent && onSelectAgent(connectedAgent)}
              >
                {connectedAgent.agentname || connectedAgent.type}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-md font-medium">Configuration</h4>
        {Object.entries(config.config).map(([key, value]) => (
          <div key={key} className="mb-2">
            <label className="block text-sm font-medium text-gray-700">{key}</label>
            {Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' ? (
              <div className="space-y-1 ml-2">
                {value.map((field: Record<string, unknown>, idx: number) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200 mb-1 text-xs">
                    {Object.entries(field).map(([fKey, fVal]) => (
                      <div key={fKey} className="text-xs text-gray-700">
                        <span className="font-semibold">{fKey}:</span> {String(fVal)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={String(value)}
                onChange={(e) => handleConfigChange(key, e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}; 