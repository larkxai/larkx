'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from '@/lib/api';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  agentType?: string;
}

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'url';
  required: boolean;
}

interface FormAgentConfig {
  fields: FormField[];
}

interface ReminderAgentConfig {
  message: string;
  delay: string;
}

interface Agent {
  id: string;
  flowId: string;
  type: 'FormAgent' | 'ReminderAgent';
  name: string;
  mode: 'Linear' | 'Passive';
  after: string | null;
  config: FormAgentConfig | ReminderAgentConfig;
}

interface AgentFlow {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  isTemplate: boolean;
  version: number;
  createdAt: Date;
  agents: Agent[];
}

interface AgentChatProps {
  candidateId: string;
  jobId: string;
  agentFlow: AgentFlow;
}

export function AgentChat({ candidateId, jobId, agentFlow }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getCurrentAgent = () => {
    return agentFlow.agents[currentAgentIndex];
  };

  const handleFormSubmit = async () => {
    const currentAgent = getCurrentAgent();
    if (currentAgent.type !== 'FormAgent') return;

    const formConfig = currentAgent.config as FormAgentConfig;
    const missingFields = formConfig.fields
      .filter(field => field.required && !formData[field.name])
      .map(field => field.label);

    if (missingFields.length > 0) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `Please fill in the following required fields: ${missingFields.join(', ')}`,
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: 'Form submitted successfully',
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await api.agent.trigger({
        candidateId,
        jobId,
        agentId: currentAgent.id,
        agentType: currentAgent.type,
        formData,
      });

      const data = await response.json();

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response || 'Form processed successfully',
        sender: 'agent',
        timestamp: new Date(),
        agentType: currentAgent.type,
      };

      setMessages(prev => [...prev, agentMessage]);
      setFormData({});

      // Move to next agent if available
      if (currentAgentIndex < agentFlow.agents.length - 1) {
        setCurrentAgentIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, there was an error processing your form.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const currentAgent = getCurrentAgent();
      const response = await api.agent.trigger({
        candidateId,
        jobId,
        message: input,
        agentId: currentAgent.id,
        agentType: currentAgent.type,
      });

      const data = await response.json();

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response || 'Agent processed your request.',
        sender: 'agent',
        timestamp: new Date(),
        agentType: currentAgent.type,
      };

      setMessages(prev => [...prev, agentMessage]);

      // Move to next agent if available
      if (currentAgentIndex < agentFlow.agents.length - 1) {
        setCurrentAgentIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error triggering agent:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, there was an error processing your request.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAgentSpecificUI = () => {
    const currentAgent = getCurrentAgent();
    if (!currentAgent) return null;

    switch (currentAgent.type) {
      case 'FormAgent':
        const formConfig = currentAgent.config as FormAgentConfig;
        return (
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">{currentAgent.name}</h3>
            {formConfig.fields.map((field) => (
              <div key={field.name} className="mb-2">
                <label className="block text-sm font-medium mb-1">
                  {field.label} {field.required && '*'}
                </label>
                <Input
                  type={field.type}
                  value={formData[field.name] || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [field.name]: e.target.value,
                    }))
                  }
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  required={field.required}
                />
              </div>
            ))}
            <Button
              onClick={handleFormSubmit}
              disabled={isLoading}
              className="mt-4"
            >
              Submit Form
            </Button>
          </div>
        );
      case 'ReminderAgent':
        const reminderConfig = currentAgent.config as ReminderAgentConfig;
        return (
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">{currentAgent.name}</h3>
            <p className="text-sm text-gray-600">
              {reminderConfig.message}
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto h-[600px] flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Agent Chat</h2>
        <p className="text-sm text-gray-500">
          Current Agent: {getCurrentAgent()?.name || 'None'}
        </p>
      </div>
      
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <span className="text-xs opacity-70">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm">Agent is thinking...</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        {renderAgentSpecificUI()}
        {getCurrentAgent()?.type !== 'FormAgent' && (
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={isLoading}>
              Send
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
} 