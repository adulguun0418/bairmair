import { NativeTabs } from 'expo-router/native-tabs';
import { useI18n } from '@/i18n/i18n';
import { FONT_FAMILIES, useColors } from '@/ui/theme';

/** The app's tabs: search (buyers' home), saved listings, the seller's listings, account. */
export default function TabsLayout() {
  const { t } = useI18n();
  const colors = useColors();
  return (
    <NativeTabs
      tintColor={colors.tint}
      labelStyle={{ fontFamily: FONT_FAMILIES.medium, fontWeight: 'normal' }}
    >
      <NativeTabs.Trigger name="(search)">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(favorites)">
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        <NativeTabs.Trigger.Label>{t('tabs.favorites')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(mine)">
        <NativeTabs.Trigger.Icon sf="house" md="home" />
        <NativeTabs.Trigger.Label>{t('tabs.mine')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(account)">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
        <NativeTabs.Trigger.Label>{t('tabs.account')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
