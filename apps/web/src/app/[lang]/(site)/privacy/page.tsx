import { ContentView, contentMetadata } from '@/components/content/ContentView';
import { privacyPage } from '@/content/privacy';

export function generateMetadata() {
  return contentMetadata(privacyPage);
}

export default function Page() {
  return <ContentView page={privacyPage} />;
}
