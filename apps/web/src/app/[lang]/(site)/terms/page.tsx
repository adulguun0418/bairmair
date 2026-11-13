import { ContentView, contentMetadata } from '@/components/content/ContentView';
import { termsPage } from '@/content/terms';

export function generateMetadata() {
  return contentMetadata(termsPage);
}

export default function Page() {
  return <ContentView page={termsPage} />;
}
