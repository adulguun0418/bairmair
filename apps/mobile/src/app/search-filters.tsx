import { parseAmount, type SearchFilters } from '@bairmair/browse';
import { DISTRICTS, SEARCH_LIMITS, SEARCH_SORTS } from '@bairmair/db';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { clearSearchFilters, setSearchFilters, useSearchFilters } from '@/browse/search-store';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { MultiChips } from '@/ui/multi-chips';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';
import { ToggleRow } from '@/ui/toggle-row';
import { Text } from '@/ui/text';

type RangeKey = 'priceMin' | 'priceMax' | 'areaMin' | 'areaMax';

function amountText(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * The Search tab's filters: the web's filter form (same fields and units). Chips apply at once;
 * the number fields apply when they lose focus or with "Зар харах".
 */
export default function SearchFiltersScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const filters = useSearchFilters();

  const [ranges, setRanges] = useState<Record<RangeKey, string>>({
    priceMin: amountText(filters.priceMin),
    priceMax: amountText(filters.priceMax),
    areaMin: amountText(filters.areaMin),
    areaMax: amountText(filters.areaMax),
  });

  const applyRanges = (next = ranges) => {
    const value = (key: RangeKey) => parseAmount(next[key]);
    const changes: Partial<SearchFilters> = {};
    for (const [min, max] of [
      ['priceMin', 'priceMax'],
      ['areaMin', 'areaMax'],
    ] as const) {
      let low = value(min);
      let high = value(max);
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      changes[min] = low;
      changes[max] = high;
    }
    setSearchFilters(changes);
  };

  const rangeField = (key: RangeKey, label: string) => (
    <View style={styles.grow}>
      <TextField
        label={label}
        value={ranges[key]}
        onChangeText={(text) => setRanges((current) => ({ ...current, [key]: text }))}
        onEndEditing={() => applyRanges()}
        keyboardType="decimal-pad"
        inputMode="decimal"
      />
    </View>
  );

  const roomsChoices = Array.from({ length: SEARCH_LIMITS.roomsPlus }, (_, i) => {
    const count = i + 1;
    return {
      value: count,
      label: count === SEARCH_LIMITS.roomsPlus ? t('search.roomsPlus', { count }) : String(count),
    };
  });

  const priceLabel = filters.currency === 'USD' ? t('search.priceUsd') : t('search.priceMnt');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <MultiChips
        label={t('search.districts')}
        choices={DISTRICTS.map((district) => ({
          value: district.slug,
          label: locale === 'mn' ? district.nameMn : district.nameEn,
        }))}
        values={filters.districts}
        onChange={(districts) => setSearchFilters({ districts })}
      />
      <MultiChips
        label={t('search.rooms')}
        choices={roomsChoices}
        values={filters.rooms}
        onChange={(rooms) => setSearchFilters({ rooms })}
      />

      {filters.type !== 'sale' && (
        <ChoiceChips
          label={t('search.currency')}
          hint={t('search.currencyNote')}
          choices={[
            { value: 'MNT' as const, label: '₮' },
            { value: 'USD' as const, label: '$' },
          ]}
          value={filters.currency}
          allowClear={false}
          onChange={(currency) => currency && setSearchFilters({ currency })}
        />
      )}
      <Text style={[styles.label, { color: colors.textMuted }]}>{priceLabel}</Text>
      <View style={styles.row}>
        {rangeField('priceMin', t('search.min'))}
        {rangeField('priceMax', t('search.max'))}
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('search.area')}</Text>
      <View style={styles.row}>
        {rangeField('areaMin', t('search.min'))}
        {rangeField('areaMax', t('search.max'))}
      </View>

      <ToggleRow
        label={t('search.has3d')}
        value={filters.has3d}
        onValueChange={(has3d) => setSearchFilters({ has3d })}
      />

      <ChoiceChips
        label={t('search.sort')}
        hint={filters.sort === 'recommended' ? t('search.recommendedHint') : undefined}
        choices={SEARCH_SORTS.map((sort) => ({ value: sort, label: t(`search.sorts.${sort}`) }))}
        value={filters.sort}
        allowClear={false}
        onChange={(sort) => sort && setSearchFilters({ sort })}
      />

      <View style={styles.row}>
        <Button
          title={t('search.reset')}
          variant="secondary"
          style={styles.grow}
          onPress={() => {
            clearSearchFilters();
            setRanges({ priceMin: '', priceMax: '', areaMin: '', areaMax: '' });
          }}
        />
        <Button
          title={t('browse.showResults')}
          style={styles.grow}
          onPress={() => {
            applyRanges();
            router.back();
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: -10 },
});
