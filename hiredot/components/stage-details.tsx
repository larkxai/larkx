import { Node } from 'reactflow'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Edit } from 'lucide-react'

interface StageDetailsProps {
  node: Node
  trigger?: React.ReactNode
}

export function StageDetails({ node, trigger }: StageDetailsProps) {
  const renderStageDetails = (stage: Node) => (
    <>
      <p className="mb-4">Details about the {stage.data.label.toLowerCase()} stage:</p>
      {stage.data.label === 'Application Form' && (
        <p>Candidates fill out their personal information, work experience, and qualifications.</p>
      )}
      {stage.data.label === 'Initial Evaluation' && (
        <p>HR reviews the application and decides whether to proceed with the candidate.</p>
      )}
      {stage.data.label === 'Interview' && (
        <p>Candidate undergoes one or more interviews with the hiring team.</p>
      )}
      {stage.data.label === 'Offer' && (
        <p>A job offer is extended to the successful candidate.</p>
      )}
      {stage.data.label === 'Rejection' && (
        <p>The candidate is not selected to proceed further in the hiring process.</p>
      )}
    </>
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || <Button>View Details</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex justify-between">
            {node.data.label}
            <Button variant="ghost">
              <Edit className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        {renderStageDetails(node)}
      </DialogContent>
    </Dialog>
  )
} 