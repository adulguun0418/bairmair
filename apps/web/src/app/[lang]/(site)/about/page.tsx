import { ContentView, contentMetadata } from '@/components/content/ContentView';
import { aboutPage } from '@/content/pages';

export function generateMetadata() {
  return contentMetadata(aboutPage);
}

export default function Page() {
  return <ContentView page={aboutPage} />;
}
