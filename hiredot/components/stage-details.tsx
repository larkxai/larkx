import { WorkflowStage } from '@/types/workflow'
import { Node } from 'reactflow'
import { FormStage } from './stages/form-stage'
import { InterviewStage } from './stages/interview-stage'
import { DefaultStage } from './stages/default-stage'

interface StageDetailsProps {
  node: Node
}

export function StageDetails({ node }: StageDetailsProps) {
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
        return <FormStage stageData={stageData} />
      case 'interview':
        return <InterviewStage stageData={stageData} />
      default:
        return <DefaultStage stageData={stageData} />
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