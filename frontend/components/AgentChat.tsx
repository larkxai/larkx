'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  triggerType: 'no_response' | 'delay' | 'manual' | 'custom';
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
  agentFlow: AgentFlow;
}

export function AgentChat({ candidateId, agentFlow }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Trigger initial agent message when component mounts
    const triggerInitialAgent = async () => {
      setIsLoading(true);
      try {
        const response = await api.agent.trigger({
          candidateId,
          flowId: agentFlow.id,
          agentId: agentFlow.agents[0].id,
          agentType: agentFlow.agents[0].type,
        });
        const agentMessage: Message = {
          id: Date.now().toString(),
          content: response.response,
          sender: 'agent',
          timestamp: new Date(),
          agentType: agentFlow.agents[0].type,
        };
        setMessages([agentMessage]);
      } catch {
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: 'Sorry, there was an error starting the conversation.',
          sender: 'agent',
          timestamp: new Date(),
        };
        setMessages([errorMessage]);
      } finally {
        setIsLoading(false);
      }
    };
    triggerInitialAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFlow.id]);

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
      const response = await api.agent.trigger({
        candidateId,
        flowId: agentFlow.id,
        agentId: agentFlow.agents[0].id,
        agentType: agentFlow.agents[0].type,
        message: input,
        history: messages.concat(userMessage),
      });
      const agentMessage: Message = {
        id: Date.now().toString(),
        content: response.response,
        sender: 'agent',
        timestamp: new Date(),
        agentType: agentFlow.agents[0].type,
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: 'Sorry, there was an error processing your response.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.sender === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg ${
                message.sender === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
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
      </div>
    </Card>
  );
} 