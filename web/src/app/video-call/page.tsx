import VideoCall from '../../components/VideoCall';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Video Consultation — Awula',
  description: 'Join your live video consultation with an Awula designer.',
};

export default function VideoCallPage() {
  return <VideoCall />;
}
