/**
 * Legacy URL — /matchday/shop now redirects to /matchday since the
 * landing/preview was merged with the shop.
 */

import { redirect } from 'next/navigation';

export default function MatchdayShopRedirect() {
  redirect('/matchday');
}
