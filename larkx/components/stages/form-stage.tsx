import { WorkflowStage } from '@/types/workflow'

interface FormStageProps {
  stageData: WorkflowStage
}

export function FormStage({ stageData }: FormStageProps) {
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
} 