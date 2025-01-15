"use client";

import { useState, useEffect } from "react";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ComplexCondition,
  WorkflowStepMetadata,
  WorkflowStepNextStep,
  WorkflowStepType,
} from "@/@types/workflow";

export interface NodeData {
  id: string;
  type: WorkflowStepType;
  label: string;
  version: string;
  conditions: ComplexCondition[];
  metadata?: WorkflowStepMetadata;
  nextSteps: WorkflowStepNextStep;
}

interface WorkflowSpotlightProps {
  onAddNode?: (nodeDetails: NodeData) => void;
  onUpdateEdge?: (edgeDetails: {
    id: string;
    source: string;
    target: string;
    data?: {
      action?: string;
      trigger?: string;
    };
  }) => void;
}

export function WorkflowSpotlight({ onAddNode }: WorkflowSpotlightProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Fix: Use useEffect instead of useCallback for event listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (value.length < 2) return;

    setLoading(true);
    try {
      // Mock AI suggestions focused on workflow modifications
      const mockAiResponse = await new Promise((resolve) => {
        setTimeout(() => {
          resolve([
            "Add an approval step that requires manager sign-off",
            "Create a conditional branch for candidates who need additional interviews",
            "Add a background check step after the offer acceptance",
            "Insert a skills assessment stage before the technical interview",
            "Add a reference check step in parallel with background check",
            "Create a loop for multiple interview rounds",
          ]);
        }, 500);
      });

      setSuggestions(mockAiResponse as string[]);
    } catch (error) {
      console.error("Error fetching AI suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (_action: string) => {
    setLoading(true);
    try {
      // Here you would process the selected action with your AI service
      // and get back the specific node/edge modifications needed

      // Mock implementation
      const mockResponse: NodeData = {
        id: `node-${Date.now()}`,
        type: "action",
        label: "Approval Stage",
        version: "1.0.0",
        conditions: [],
        nextSteps: {
          default: "next_step_id",
        },
      };

      if (onAddNode) {
        onAddNode(mockResponse);
      }
    } catch (error) {
      console.error("Error processing action:", error);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="default"
        size="lg"
        className="px-8 py-6 text-lg bg-black hover:bg-black/90"
      >
        <span className="flex items-center gap-2">
          <span>Enter Prompt</span>
          <span className="text-xs text-white border border-white bg-transparent px-1 rounded">
            ⌘
          </span>
          K
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <Command className="rounded-lg border shadow-md">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500"
                placeholder="Describe the changes you want to make..."
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading && (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {!loading && query.length === 0 && (
                <div className="p-4 text-sm text-gray-500">
                  <p className="font-medium mb-2">Try prompts like:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      &quot;Add an approval step after the interview&quot;
                    </li>
                    <li>
                      &quot;Create a conditional path for rejected
                      candidates&quot;
                    </li>
                    <li>
                      &quot;Add a feedback collection step in parallel&quot;
                    </li>
                    <li>
                      &quot;Insert a skills assessment before technical
                      round&quot;
                    </li>
                  </ul>
                </div>
              )}
              {!loading &&
                suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="flex w-full items-center rounded-sm px-4 py-2 text-sm hover:bg-gray-100 text-left"
                    onClick={() => handleSelect(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              {!loading && suggestions.length === 0 && query && (
                <p className="p-4 text-sm text-gray-500">
                  No suggestions available for this modification. Try being more
                  specific or use different wording.
                </p>
              )}
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
