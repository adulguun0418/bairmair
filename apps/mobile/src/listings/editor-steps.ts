import { formToFields, type FormField, type PublishRequirement } from '@bairmair/browse';
import { isLive, type LocalListing } from './model';
import { missingToPublish } from './sync-plan';

/**
 * The listing editor as steps: what each one holds, and whether it is done. The order is the
 * order on screen. `scan` is optional (only LiDAR iPhones can scan); `publish` is the last one.
 */
export const EDITOR_STEPS = [
  'basics',
  'price',
  'property',
  'location',
  'photos',
  'scan',
  'publish',
] as const;

export type EditorStepId = (typeof EDITOR_STEPS)[number];

/** `error`: a field in the step has a value the database would refuse. */
export type StepState = 'done' | 'todo' | 'error';

export interface EditorStep {
  id: EditorStepId;
  state: StepState;
  /** Not needed to publish. */
  optional: boolean;
}

/** The form fields edited in each step (their errors mark the step). */
const STEP_FIELDS: Partial<Record<EditorStepId, readonly FormField[]>> = {
  basics: ['type', 'title', 'description'],
  price: [
    'price',
    'currency',
    'negotiable',
    'mortgageEligible',
    'deposit',
    'minTermMonths',
    'utilitiesIncluded',
  ],
  property: [
    'rooms',
    'areaOfficial',
    'floor',
    'totalFloors',
    'buildingYear',
    'buildingMaterial',
    'newBuilding',
    'heating',
    'balconies',
    'parking',
    'furnishing',
  ],
  location: [
    'districtId',
    'khoroo',
    'complexName',
    'addressText',
    'showExactLocation',
    'unitNumber',
  ],
};

/** The publish requirements each step satisfies. */
const STEP_REQUIREMENTS: Partial<Record<EditorStepId, readonly PublishRequirement[]>> = {
  basics: ['title'],
  price: ['price'],
  property: ['rooms', 'area'],
  location: ['district', 'location'],
  photos: ['photo'],
};

export function editorSteps(listing: LocalListing): EditorStep[] {
  const { errors } = formToFields(listing.form);
  const missing = new Set(missingToPublish(listing));
  // An empty required field is "to do", not an error: the checklist already names it.
  const invalid = (fields: readonly FormField[]) =>
    fields.some((field) => errors[field] !== undefined && errors[field] !== 'required');

  return EDITOR_STEPS.map((id): EditorStep => {
    switch (id) {
      case 'scan': {
        const processing = listing.scan?.processing;
        const state = processing === 'failed' ? 'error' : processing ? 'done' : 'todo';
        return { id, state, optional: true };
      }
      case 'publish':
        return { id, state: isLive(listing.serverStatus) ? 'done' : 'todo', optional: false };
      default: {
        if (invalid(STEP_FIELDS[id] ?? [])) return { id, state: 'error', optional: false };
        const needs = STEP_REQUIREMENTS[id] ?? [];
        const done = needs.every((requirement) => !missing.has(requirement));
        return { id, state: done ? 'done' : 'todo', optional: false };
      }
    }
  });
}

/** Progress towards publishing: required steps before "publish" that are done. */
export function editorProgress(steps: readonly EditorStep[]): { done: number; total: number } {
  const counted = steps.filter((step) => !step.optional && step.id !== 'publish');
  return {
    done: counted.filter((step) => step.state === 'done').length,
    total: counted.length,
  };
}
