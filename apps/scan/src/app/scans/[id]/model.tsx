import { sharedScanEmbedPath } from '@bairmair/browse';
import { localePath } from '@bairmair/i18n';
import { useI18n } from '@bairmair/native-ui/i18n';
import { ModelEmbed } from '@bairmair/native-ui/model-embed';
import { useLocalSearchParams } from 'expo-router';
import { env } from '@/lib/env';

/**
 * A scan's 3D model full screen: the website's `/embed/s/<slug>` page, the same view its link
 * shows. Needs the link on (the page is the public one).
 */
export default function ScanModelScreen() {
  const { slug } = useLocalSearchParams<{ id: string; slug: string }>();
  const { t, locale } = useI18n();
  return (
    <ModelEmbed
      embedUrl={`${env.siteUrl}${sharedScanEmbedPath(locale, slug)}`}
      id={slug}
      webUrl={`${env.siteUrl}${localePath(locale, `/s/${slug}`)}`}
      missingText={t('sharedScan.notAvailable')}
    />
  );
}
