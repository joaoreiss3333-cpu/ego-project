import { redirect } from 'next/navigation';
import { SITE_PATHS } from '@ego/content';

export default function Index() {
  redirect(SITE_PATHS.rankingSolo);
}
