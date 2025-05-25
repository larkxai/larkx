import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const { candidateId, jobId, message } = await request.json();

    const data = await api.agent.trigger(candidateId, jobId, message);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in agent trigger:', error);
    return NextResponse.json(
      { error: 'Failed to process agent request' },
      { status: 500 }
    );
  }
}