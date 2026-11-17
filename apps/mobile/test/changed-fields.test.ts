import { describe, expect, it } from 'vitest';
import { changedFields } from '@bairmair/browse';
import {
  markCreated,
  markSynced,
  newListing,
  normalizeListing,
  updateForm,
  type LocalListing,
} from '../src/listings/model';
import { mergeServerCopy } from '../src/listings/refresh';
import { isSynced, planSync } from '../src/listings/sync-plan';
import { fieldsOf, OWNER, setup } from './sync-fakes';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-17T10:00:00.000Z';

/** A sale listing the server has, as this phone created it. */
function created(): LocalListing {
  const listing = updateForm(
    newListing(ID, OWNER, NOW),
    { title: 'Зайсан, 3 өрөө', price: '250000000', rooms: '3', areaOfficial: '80' },
    NOW,
  );
  return markCreated(listing, listing.rev, fieldsOf(listing));
}

const updateOp = (listing: LocalListing) => {
  const op = planSync(listing).op;
  if (op?.kind !== 'updateListing') throw new Error(`expected an update, got ${op?.kind}`);
  return op;
};

describe('changedFields', () => {
  it('keeps only the columns that differ from the baseline', () => {
    const listing = created();
    const edited = fieldsOf(updateForm(listing, { price: '240000000' }, NOW));
    expect(changedFields(edited, listing.syncedFields)).toEqual({ price: 240000000 });
  });

  it('returns every column without a baseline', () => {
    const fields = fieldsOf(created());
    expect(changedFields(fields, null)).toEqual(fields);
  });
});

describe('sending only changed columns', () => {
  it('sends just the edited column after the create', () => {
    const listing = updateForm(created(), { title: 'Зайсан, 3 өрөө, шинэ засвар' }, NOW);
    expect(updateOp(listing).fields).toEqual({ title: 'Зайсан, 3 өрөө, шинэ засвар' });
  });

  it('sends the columns a sale → rent switch touches, not the untouched ones', () => {
    const listing = updateForm(created(), { type: 'rent', currency: 'USD' }, NOW);
    const fields = updateOp(listing).fields;
    expect(fields).toMatchObject({ type: 'rent', currency: 'USD' });
    expect(fields).not.toHaveProperty('title');
    expect(fields).not.toHaveProperty('price');
    expect(fields).not.toHaveProperty('rooms');
  });

  it('keeps a column changed on the website when the phone edits another one', () => {
    // The website changed the price; the refresh takes the server's copy and its baseline.
    const phone = created();
    const serverForm = { ...phone.form, price: '240000000' };
    const server: LocalListing = {
      ...phone,
      form: serverForm,
      syncedFields: fieldsOf({ ...phone, form: serverForm }),
    };
    const merged = mergeServerCopy(phone, server, NOW)!.listing;
    expect(merged.syncedFields?.price).toBe(240000000);

    // Then the phone changes the title: only the title goes out, the web's price stays.
    const edited = updateForm(merged, { title: 'Зайсан, 3 өрөө, тохилог' }, NOW);
    expect(updateOp(edited).fields).toEqual({ title: 'Зайсан, 3 өрөө, тохилог' });
  });

  it('a stale phone copy no longer overwrites another column', async () => {
    // The phone edits the title while the website has changed the price: only the title is sent.
    const { remote, engine } = setup(
      updateForm(created(), { title: 'Зайсан, 3 өрөө, тохилог' }, NOW),
    );
    remote.rows.set(ID, { ...fieldsOf(created()), price: 240000000 });
    await engine.run();
    expect(remote.updates).toEqual([{ title: 'Зайсан, 3 өрөө, тохилог' }]);
    expect(remote.rows.get(ID)).toMatchObject({
      price: 240000000,
      title: 'Зайсан, 3 өрөө, тохилог',
    });
  });

  it('sends nothing for an edit that was changed back, and counts as synced', async () => {
    let listing = updateForm(created(), { price: '1' }, NOW);
    listing = updateForm(listing, { price: '250000000' }, NOW);
    expect(updateOp(listing).fields).toEqual({});

    const { store, remote, engine } = setup(listing);
    await engine.run();
    expect(remote.calls).not.toContain('updateListing');
    expect(isSynced(store.get(ID)!)).toBe(true);
  });

  it('moves the baseline by what each update sent', async () => {
    const { store, remote, engine } = setup(updateForm(created(), { price: '240000000' }, NOW));
    await engine.run();
    store.update(ID, (current) => updateForm(current, { rooms: '4' }, NOW));
    await engine.run();
    expect(remote.updates).toEqual([{ price: 240000000 }, { rooms: 4 }]);
    expect(store.get(ID)!.syncedFields).toMatchObject({ price: 240000000, rooms: 4 });
  });

  it('sends every column once for a listing saved before the baseline existed', async () => {
    const old = { ...updateForm(created(), { price: '240000000' }, NOW) } as Partial<LocalListing>;
    delete old.syncedFields;
    const listing = normalizeListing(old as LocalListing);
    expect(listing.syncedFields).toBeNull();
    expect(updateOp(listing).fields).toEqual(fieldsOf(listing));

    // After that update the baseline exists, and the next edit sends only its column.
    const after = markSynced(listing, listing.rev, fieldsOf(listing));
    expect(updateOp(updateForm(after, { rooms: '4' }, NOW)).fields).toEqual({ rooms: 4 });
  });

  it('takes the server baseline in a refresh even when nothing else differs', () => {
    const phone = { ...created(), syncedFields: null };
    const server = created();
    const merged = mergeServerCopy(phone, server, NOW);
    expect(merged?.listing.syncedFields).toEqual(server.syncedFields);
    expect(merged?.listing.form).toBe(phone.form);
  });
});
