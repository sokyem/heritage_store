import { redirect } from 'next/navigation';

// `/profile` was a stripped-down duplicate of `/measurements`. The full
// measurements + fit-preference form lives at `/measurements`, and the
// customer dashboard at `/customer/dashboard` already links to it.
export default function ProfileRedirect() {
  redirect('/measurements');
}
