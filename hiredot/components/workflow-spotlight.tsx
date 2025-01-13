"use client";

import { useState, useCallback, useEffect } from "react";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import { Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WorkflowSpotlightProps {
  onAddNode?: (nodeDetails: any) => void;
  onUpdateEdge?: (edgeDetails: any) => void;
}

export function WorkflowSpotlight({ onAddNode, onUpdateEdge }: WorkflowSpotlightProps) {
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

  const handleSelect = async (action: string) => {
    setLoading(true);
    try {
      // Here you would process the selected action with your AI service
      // and get back the specific node/edge modifications needed
      
      // Mock implementation
      const mockResponse = {
        type: "add_node",
        data: {
          id: `node-${Date.now()}`,
          type: "approval",
          label: "Approval Stage",
          // ... other node properties
        },
      };

      if (mockResponse.type === "add_node" && onAddNode) {
        onAddNode(mockResponse.data);
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
          <span className="text-xs text-white border border-white bg-transparent px-1 rounded">⌘</span>K
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
                    <li>"Add an approval step after the interview"</li>
                    <li>"Create a conditional path for rejected candidates"</li>
                    <li>"Add a feedback collection step in parallel"</li>
                    <li>"Insert a skills assessment before technical round"</li>
                  </ul>
                </div>
              )}
              {!loading && suggestions.map((suggestion, index) => (
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
                  No suggestions available for this modification. Try being more specific or use different wording.
                </p>
              )}
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
} 