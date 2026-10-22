import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInternalMetadata, buildSelfServiceMetadata } from '../src/modules/auth/auth.metadata.js';

describe('buildSelfServiceMetadata', () => {
  it('no incluye company_id (dispara la creación de Company nueva)', () => {
    const meta = buildSelfServiceMetadata({ username: 'duenio', hotelName: 'Hotel Luna' });
    assert.equal('company_id' in meta, false);
    assert.equal(meta.role, 'OWNER');
    assert.equal(meta.username, 'duenio');
    assert.equal(meta.hotel_name, 'Hotel Luna');
  });

  it('omite name cuando no viene', () => {
    const meta = buildSelfServiceMetadata({ username: 'duenio', name: null, hotelName: 'Hotel Luna' });
    assert.equal('name' in meta, false);
  });

  it('incluye name cuando viene', () => {
    const meta = buildSelfServiceMetadata({ username: 'duenio', name: 'Ana', hotelName: 'Hotel Luna' });
    assert.equal(meta.name, 'Ana');
  });
});

describe('buildInternalMetadata', () => {
  it('incluye company_id y el rol', () => {
    const meta = buildInternalMetadata({
      username: 'recepcion',
      role: 'RECEPCIONISTA',
      companyId: 7,
      createdById: 3,
      isActive: true,
    });
    assert.equal(meta.company_id, 7);
    assert.equal(meta.role, 'RECEPCIONISTA');
    assert.equal(meta.created_by_id, 3);
    assert.equal(meta.is_active, true);
    assert.equal('hotel_name' in meta, false);
  });

  it('omite created_by_id cuando es null', () => {
    const meta = buildInternalMetadata({
      username: 'admin',
      role: 'ADMIN',
      companyId: 1,
      createdById: null,
      isActive: false,
    });
    assert.equal('created_by_id' in meta, false);
    assert.equal(meta.is_active, false);
  });
});
