import { Loader2 } from "lucide-react";

interface LoaderProps {
  message?: string;
}

export function Loader({ message = "Loading..." }: LoaderProps) {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-slate-300 text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

export function FullscreenLoader({ message = "Loading..." }: LoaderProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-slate-700"></div>
          <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin"></div>
        </div>
        <p className="text-slate-300 text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}
