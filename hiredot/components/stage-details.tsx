import { WorkflowStage } from '@/types/workflow'
import { Node } from 'reactflow'

interface StageDetailsProps {
  node: Node
  trigger: React.ReactNode
}

export function StageDetails({ node, trigger: triggerButton }: StageDetailsProps) {
  const stageData = node.data as WorkflowStage

  const renderTriggers = () => {
    if (stageData.triggers.length === 0) return null

    return (
      <div className="mt-4">
        <h4 className="font-medium mb-2">Transition Rules:</h4>
        <div className="space-y-2">
          {stageData.triggers.map((trigger) => (
            <div 
              key={trigger.id} 
              className="p-3 bg-gray-50 border rounded"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-mono text-sm bg-blue-100 px-2 py-1 rounded">
                  {trigger.rule}
                </span>
                <span className="text-sm font-medium text-blue-600">
                  {trigger.action}
                </span>
              </div>
              <div className="text-sm">
                <p className="text-gray-600 mb-1">{trigger.description}</p>
                <div className="flex items-center text-gray-500 mt-2">
                  <span>Stage {trigger.sourceStageId}</span>
                  <span className="mx-2">→</span>
                  <span className="text-gray-700">
                    {trigger.stageType.charAt(0).toUpperCase() + trigger.stageType.slice(1)} 
                    (Stage {trigger.targetStageId})
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderStageContent = () => {
    switch (stageData.type) {
      case 'form':
        return (
          <div className="space-y-4">
            {stageData.questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="font-medium">{q.question}</p>
                {q.type === 'text' && <input type="text" className="w-full p-2 border rounded" />}
                {q.type === 'checkbox' && (
                  <div className="space-y-2">
                    {q.options?.map((option) => (
                      <label key={option} className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {q.type === 'multipleChoice' && (
                  <div className="space-y-2">
                    {q.options?.map((option) => (
                      <label key={option} className="flex items-center space-x-2">
                        <input type="radio" name={q.id} />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      case 'interview':
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
      default:
        return <p>{stageData.message}</p>
    }
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">{stageData.title}</h3>
      {renderStageContent()}
      {renderTriggers()}
    </div>
  )
} 