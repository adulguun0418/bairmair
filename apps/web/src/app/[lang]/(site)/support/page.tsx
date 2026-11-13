import { ContentView, contentMetadata } from '@/components/content/ContentView';
import { supportPage } from '@/content/pages';

export function generateMetadata() {
  return contentMetadata(supportPage);
}

export default function Page() {
  return <ContentView page={supportPage} />;
}
