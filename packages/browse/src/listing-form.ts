import {
  districtById,
  LISTING_LIMITS,
  ULAANBAATAR_ID,
  type Database,
  type Tables,
} from '@bairmair/db';

// The listing form as the seller edits it (in the app and on the website), and its mapping to and from the `listings` row.
// Pure: no React Native imports, so it runs in unit tests.

type Enums = Database['public']['Enums'];
export type ListingType = Enums['listing_type'];
export type ListingStatus = Enums['listing_status'];
export type Currency = Enums['currency_code'];
export type BuildingMaterial = Enums['building_material'];
export type Heating = Enums['heating_type'];
export type Parking = Enums['parking_type'];
export type Furnishing = Enums['furnishing'];

/**
 * Text inputs are kept as typed (strings), so a half-typed value survives a restart and is
 * shown back exactly. `null` choices mean "not given".
 */
export interface ListingForm {
  type: ListingType;
  title: string;
  description: string;

  price: string;
  /** USD is allowed for rent only; sale listings are always saved in MNT. */
  currency: Currency;
  negotiable: boolean;

  rooms: string;
  areaOfficial: string;
  floor: string;
  totalFloors: string;
  buildingYear: string;
  buildingMaterial: BuildingMaterial | null;
  newBuilding: boolean;
  heating: Heating | null;
  balconies: string;
  parking: Parking | null;
  furnishing: Furnishing | null;

  /** Sale only (ипотек). */
  mortgageEligible: boolean | null;
  /** Rent only. */
  deposit: string;
  minTermMonths: string;
  utilitiesIncluded: boolean | null;

  districtId: number | null;
  khoroo: string;
  complexName: string;
  addressText: string;
  showExactLocation: boolean;
  /** Private (listing_private): only the owner sees it. */
  unitNumber: string;
}

export const EMPTY_FORM: ListingForm = {
  type: 'sale',
  title: '',
  description: '',
  price: '',
  currency: 'MNT',
  negotiable: false,
  rooms: '',
  areaOfficial: '',
  floor: '',
  totalFloors: '',
  buildingYear: '',
  buildingMaterial: null,
  newBuilding: false,
  heating: null,
  balconies: '',
  parking: null,
  furnishing: null,
  mortgageEligible: null,
  deposit: '',
  minTermMonths: '',
  utilitiesIncluded: null,
  districtId: null,
  khoroo: '',
  complexName: '',
  addressText: '',
  showExactLocation: false,
  unitNumber: '',
};

export type FormField = keyof ListingForm;

/** Fields stored in `listing_private` rather than `listings`. */
export const PRIVATE_FIELDS: readonly FormField[] = ['unitNumber'];

export type FieldError =
  | 'required'
  | 'notANumber'
  | 'notWhole'
  | 'tooSmall'
  | 'tooLarge'
  | 'tooShort'
  | 'tooLong'
  | 'aboveTotalFloors';

export type FormErrors = Partial<Record<FormField, FieldError>>;

// Numbers ------------------------------------------------------------------------------------

/** Spaces of any kind, as typed or pasted: `\s` covers no-break and thin spaces too. */
const SPACES = /\s/g;

/**
 * Parses a number as people type it: `250 000 000`, `250,000,000`, `65.5`, or `65,5` (a decimal
 * comma). Returns null for an empty input and NaN for anything that is not a number.
 */
export function parseNumberInput(text: string): number | null {
  let value = text.replace(SPACES, '');
  if (value === '') return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(value) && !/^-?\d{1,3}[.,]\d{3}$/.test(value)) {
    // Two or more groups of three: thousands separators, whichever character (1.250.000).
    value = value.replace(/[.,]/g, '');
  } else if (value.includes('.')) {
    value = value.replace(/,/g, '');
  } else if (/^-?\d+,\d{1,2}$/.test(value)) {
    value = value.replace(',', '.');
  } else {
    value = value.replace(/,/g, '');
  }
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
}

interface NumberRule {
  min?: number;
  /** Strictly greater than this (area > 0). */
  above?: number;
  max: number;
  whole?: boolean;
  /** Rounded to this many decimals before saving. */
  decimals?: number;
}

function readNumber(text: string, rule: NumberRule): { value: number | null; error?: FieldError } {
  const parsed = parseNumberInput(text);
  if (parsed === null) return { value: null };
  if (Number.isNaN(parsed)) return { value: null, error: 'notANumber' };
  if (rule.whole && !Number.isInteger(parsed)) return { value: null, error: 'notWhole' };
  const factor = 10 ** (rule.decimals ?? 0);
  const value = rule.whole ? parsed : Math.round(parsed * factor) / factor;
  if (rule.min !== undefined && value < rule.min) return { value: null, error: 'tooSmall' };
  if (rule.above !== undefined && value <= rule.above) return { value: null, error: 'tooSmall' };
  if (value > rule.max) return { value: null, error: 'tooLarge' };
  return { value };
}

const L = LISTING_LIMITS;

const NUMBER_RULES = {
  price: { min: L.price.min, max: L.price.max, decimals: 2 },
  deposit: { min: L.price.min, max: L.price.max, decimals: 2 },
  areaOfficial: { above: 0, max: L.area.max, decimals: 2 },
  rooms: { ...L.rooms, whole: true },
  floor: { ...L.floor, whole: true },
  totalFloors: { ...L.totalFloors, whole: true },
  buildingYear: { ...L.buildingYear, whole: true },
  balconies: { ...L.balconies, whole: true },
  minTermMonths: { ...L.minTermMonths, whole: true },
  khoroo: { ...L.khoroo, whole: true },
} satisfies Partial<Record<FormField, NumberRule>>;

type NumberField = keyof typeof NUMBER_RULES;

// Row mapping ---------------------------------------------------------------------------------

/** The `listings` columns the app writes (all client-writable except `id` and `status`). */
export type ListingFields = Pick<
  Tables<'listings'>,
  | 'type'
  | 'title'
  | 'description'
  | 'price'
  | 'currency'
  | 'negotiable'
  | 'area_official_m2'
  | 'rooms'
  | 'floor'
  | 'total_floors'
  | 'building_year'
  | 'building_material'
  | 'new_building'
  | 'heating'
  | 'balconies'
  | 'parking'
  | 'furnishing'
  | 'mortgage_eligible'
  | 'deposit'
  | 'min_term_months'
  | 'utilities_included'
  | 'city_id'
  | 'district_id'
  | 'khoroo'
  | 'complex_name'
  | 'address_text'
  | 'show_exact_location'
>;

export type FormResult =
  | { ok: true; fields: ListingFields; errors: FormErrors }
  | { ok: false; fields: null; errors: FormErrors };

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validates the form against the database's rules and maps it to the `listings` columns.
 * Empty optional fields are fine (drafts are incomplete); a draft needs only a title.
 * `unitNumber` is checked here too, but saved to `listing_private` (see `privateUnitNumber`).
 */
export function formToFields(form: ListingForm): FormResult {
  const errors: FormErrors = {};
  const numbers = {} as Record<NumberField, number | null>;
  for (const field of Object.keys(NUMBER_RULES) as NumberField[]) {
    const { value, error } = readNumber(form[field], NUMBER_RULES[field]);
    numbers[field] = value;
    if (error) errors[field] = error;
  }

  const title = form.title.trim();
  if (title === '') errors.title = 'required';
  else if (title.length < L.title.min) errors.title = 'tooShort';
  else if (title.length > L.title.max) errors.title = 'tooLong';

  const lengths: [FormField, string, number][] = [
    ['description', form.description, L.description.max],
    ['complexName', form.complexName, L.complexName.max],
    ['addressText', form.addressText, L.addressText.max],
    ['unitNumber', form.unitNumber, L.unitNumber.max],
  ];
  for (const [field, value, max] of lengths) {
    if (value.trim().length > max) errors[field] = 'tooLong';
  }

  if (
    numbers.floor !== null &&
    numbers.totalFloors !== null &&
    numbers.floor > numbers.totalFloors
  ) {
    errors.floor = 'aboveTotalFloors';
  }

  if (Object.keys(errors).length > 0) return { ok: false, fields: null, errors };

  const sale = form.type === 'sale';
  const district = districtById(form.districtId);
  return {
    ok: true,
    errors,
    fields: {
      type: form.type,
      title,
      description: text(form.description),
      price: numbers.price,
      currency: sale ? 'MNT' : form.currency,
      negotiable: form.negotiable,
      area_official_m2: numbers.areaOfficial,
      rooms: numbers.rooms,
      floor: numbers.floor,
      total_floors: numbers.totalFloors,
      building_year: numbers.buildingYear,
      building_material: form.buildingMaterial,
      new_building: form.newBuilding,
      heating: form.heating,
      balconies: numbers.balconies ?? 0,
      parking: form.parking,
      furnishing: form.furnishing,
      mortgage_eligible: sale ? form.mortgageEligible : null,
      deposit: sale ? null : numbers.deposit,
      min_term_months: sale ? null : numbers.minTermMonths,
      utilities_included: sale ? null : form.utilitiesIncluded,
      city_id: district?.cityId ?? ULAANBAATAR_ID,
      district_id: district?.id ?? null,
      khoroo: numbers.khoroo,
      complex_name: text(form.complexName),
      address_text: text(form.addressText),
      show_exact_location: form.showExactLocation,
    },
  };
}

export function privateUnitNumber(form: ListingForm): string | null {
  return text(form.unitNumber);
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** The form for a listing downloaded from the server (editing on a second phone). */
export function formFromRow(
  row: ListingFields,
  unitNumber: string | null | undefined,
): ListingForm {
  return {
    type: row.type,
    title: row.title,
    description: row.description ?? '',
    price: numberText(row.price),
    currency: row.currency,
    negotiable: row.negotiable,
    rooms: numberText(row.rooms),
    areaOfficial: numberText(row.area_official_m2),
    floor: numberText(row.floor),
    totalFloors: numberText(row.total_floors),
    buildingYear: numberText(row.building_year),
    buildingMaterial: row.building_material,
    newBuilding: row.new_building,
    heating: row.heating,
    balconies: row.balconies === 0 ? '' : String(row.balconies),
    parking: row.parking,
    furnishing: row.furnishing,
    mortgageEligible: row.mortgage_eligible,
    deposit: numberText(row.deposit),
    minTermMonths: numberText(row.min_term_months),
    utilitiesIncluded: row.utilities_included,
    districtId: row.district_id,
    khoroo: numberText(row.khoroo),
    complexName: row.complex_name ?? '',
    addressText: row.address_text ?? '',
    showExactLocation: row.show_exact_location,
    unitNumber: unitNumber ?? '',
  };
}

// Publishing ----------------------------------------------------------------------------------

export type PublishRequirement =
  'title' | 'price' | 'rooms' | 'area' | 'district' | 'location' | 'photo' | 'validFields';

/**
 * What is still missing before the listing can be published, mirroring the database's
 * `listings_complete_when_live` check and the publish trigger. The verified phone is an
 * account requirement and is checked separately.
 */
export function missingForPublish(input: {
  form: ListingForm;
  hasLocation: boolean;
  photoCount: number;
  /** A ready scan supplies `area_scanned_m2`, which also satisfies the area rule. */
  hasScannedArea?: boolean;
}): PublishRequirement[] {
  const { form } = input;
  const result = formToFields(form);
  const missing: PublishRequirement[] = [];
  if (result.errors.title) missing.push('title');
  if (form.price.trim() === '') missing.push('price');
  if (form.rooms.trim() === '') missing.push('rooms');
  if (form.areaOfficial.trim() === '' && !input.hasScannedArea) missing.push('area');
  if (form.districtId === null) missing.push('district');
  if (!input.hasLocation) missing.push('location');
  if (input.photoCount === 0) missing.push('photo');
  const otherErrors = Object.keys(result.errors).filter((field) => field !== 'title');
  if (otherErrors.length > 0) missing.push('validFields');
  return missing;
}
