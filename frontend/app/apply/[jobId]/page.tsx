'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface ApplyPageProps {
  params: {
    jobId: string;
  };
}

export default function ApplyPage({ params }: ApplyPageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    const startApplication = async () => {
      if (hasStartedRef.current) return;
      
      try {
        hasStartedRef.current = true;
        // Create a new candidate with empty initial data
        const data = await api.candidates.create({
          name: '',
          email: '',
          jobId: params.jobId,
        });
        
        // Redirect to chat with the new candidate ID
        router.push(`/chat/${data.id}?jobId=${params.jobId}`);
      } catch (error) {
        console.error('Error creating candidate:', error);
        alert('Failed to start application. Please try again.');
        hasStartedRef.current = false;
      } finally {
        setIsLoading(false);
      }
    };

    startApplication();
  }, [params.jobId, router]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <p>Starting your application...</p>
        </div>
      </div>
    );
  }

  return null;
}