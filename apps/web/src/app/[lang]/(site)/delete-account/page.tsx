import { ContentView, contentMetadata } from '@/components/content/ContentView';
import { deleteAccountPage } from '@/content/pages';

export function generateMetadata() {
  return contentMetadata(deleteAccountPage);
}

export default function Page() {
  return <ContentView page={deleteAccountPage} />;
}
