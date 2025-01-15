import { WorkflowStage } from '@/types/workflow'

interface DefaultStageProps {
  stageData: WorkflowStage
}

export function DefaultStage({ stageData }: DefaultStageProps) {
  return <p>{stageData.message}</p>
} 