import { WorkflowStage } from '@/types/workflow'

interface InterviewStageProps {
  stageData: WorkflowStage
}

export function InterviewStage({ stageData }: InterviewStageProps) {
  return (
    <div className="space-y-4">
      <p>{stageData.message}</p>
      <div className="space-y-2">
        {stageData.timeSlots.map((slot) => (
          <button
            key={slot.id}
            className={`block w-full p-2 text-left border rounded ${
              slot.available ? 'bg-green-50' : 'bg-gray-100'
            }`}
            disabled={!slot.available}
          >
            {new Date(slot.startTime).toLocaleString()} - {new Date(slot.endTime).toLocaleString()}
          </button>
        ))}
      </div>
      <a href={stageData.callLink} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
        Join Call
      </a>
    </div>
  )
} 