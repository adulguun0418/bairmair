import { listingEmbedPath } from '@bairmair/browse';
import { localePath } from '@bairmair/i18n';
import { useI18n } from '@bairmair/native-ui/i18n';
import { ModelEmbed } from '@bairmair/native-ui/model-embed';
import { useLocalSearchParams } from 'expo-router';
import { env } from '@/lib/env';

/**
 * A listing's 3D model, full screen: the web's embed page (`/embed/listings/[id]`) in a WebView,
 * so the 3D view is the same one the website shows. Full screen rather than inside the listing
 * page, so dragging the model never fights the page's scrolling.
 */
export default function ListingModelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  return (
    <ModelEmbed
      embedUrl={`${env.siteUrl}${listingEmbedPath(locale, id)}`}
      id={id}
      webUrl={`${env.siteUrl}${localePath(locale, `/listings/${id}`)}`}
      missingText={t('browse.notFound')}
    />
  );
}
