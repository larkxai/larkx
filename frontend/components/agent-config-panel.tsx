"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Agent, AgentMode, FormAgentConfig, ReminderAgentConfig } from '@/@types/agent';

interface AgentConfigPanelProps {
  agent: Agent | null;
  onSave: (updatedAgent: Agent, allAgents: Agent[]) => void;
  agents?: Agent[]; // Pass all agents for the dropdown
}

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({ agent, onSave, agents = [] }) => {
  const [config, setConfig] = React.useState<Agent | null>(agent);

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

  const handleConfigChange = (key: string, value: unknown) => {
    if (!config) return;
    if (key === 'after') {
      setConfig({ ...config, after: value as string | null });
      return;
    }
    if (config.type === 'FormAgent') {
      setConfig({
        ...config,
        config: {
          ...config.config,
          [key]: value,
        } as FormAgentConfig,
      });
    } else if (config.type === 'ReminderAgent') {
      setConfig({
        ...config,
        config: {
          ...config.config,
          [key]: value,
        } as ReminderAgentConfig,
      });
    }
  };

  const handleSave = () => {
    if (!config) return;
    // Update the agent in the global flow state
    const updatedAgents = agents.map((a) =>
      a.id === config.id ? config : a
    );
    onSave(config, updatedAgents);
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
            <label className="block text-sm font-medium text-gray-700">Mode</label>
            <Select
              value={config.mode}
              onValueChange={(val: AgentMode) => setConfig({ ...config, mode: val })}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AgentMode.Linear}>Linear</SelectItem>
                <SelectItem value={AgentMode.Passive}>Passive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">After</label>
            <Select
              value={config.after ?? '__none__'}
              onValueChange={val => handleConfigChange('after', val === '__none__' ? null : val)}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="None (start of flow)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (start of flow)</SelectItem>
                {agents.filter(a => a.id !== config.id).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.type} ({a.id.slice(-4)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-md font-medium">Configuration</h4>
        {config.type === 'FormAgent' && (
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Form Fields</h5>
            {config.config.fields.map((field, index) => (
              <div key={index} className="p-2 bg-gray-50 rounded border border-gray-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={field.name}
                      onChange={e => {
                        const newFields = [...config.config.fields];
                        newFields[index] = { ...field, name: e.target.value };
                        handleConfigChange('fields', newFields);
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Label</label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => {
                        const newFields = [...config.config.fields];
                        newFields[index] = { ...field, label: e.target.value };
                        handleConfigChange('fields', newFields);
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Type</label>
                    <Select
                      value={field.type}
                      onValueChange={(val: 'text' | 'email' | 'number' | 'url') => {
                        const newFields = [...config.config.fields];
                        newFields[index] = { ...field, type: val };
                        handleConfigChange('fields', newFields);
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full text-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => {
                          const newFields = [...config.config.fields];
                          newFields[index] = { ...field, required: e.target.checked };
                          handleConfigChange('fields', newFields);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-medium text-gray-700">Required</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newFields = [...config.config.fields, { name: '', label: '', type: 'text', required: false }];
                handleConfigChange('fields', newFields);
              }}
            >
              Add Field
            </Button>
          </div>
        )}
        {config.type === 'ReminderAgent' && (
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <input
                type="text"
                value={config.config.message}
                onChange={e => handleConfigChange('message', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Delay (in hours)</label>
              <input
                type="text"
                value={config.config.delay}
                onChange={e => handleConfigChange('delay', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Trigger Type</label>
              <Select
                value={config.config.triggerType || 'no_response'}
                onValueChange={val => handleConfigChange('triggerType', val)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select trigger type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_response">No response from candidate</SelectItem>
                  <SelectItem value="delay">After delay</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* <div className="flex justify-end">
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </div> */}
    </div>
  );
}; 