"""
Per-invite sharing scope — what a family invitation is allowed to read.

The point of this feature is that the boundary is the SERVER'S. A caregiver
must never receive the ciphertext of a document outside their grant's scope,
because a client-side filter is only a promise: the family grant re-wraps the
patient's master key, so anything that reaches the caregiver's browser is
readable by a modified client or by opening IndexedDB.

So these tests assert the SQL, not the UI. The three things that would quietly
undo the feature:

  1. the read stops being fail-closed, and unclassified documents flow again —
     that is every diary written before this shipped;
  2. a caregiver gets to set or change `share_class`, and can file themselves
     into a wider scope or reclassify their way into one;
  3. the write paths stay unscoped, so a narrow-scope caregiver can overwrite
     or delete a diary entry by guessing its id — being unable to read what
     you destroy is not much of a consolation.
"""
import json
import re
import sys
import os
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

SERVER_PY = Path(__file__).resolve().parents[1] / 'server.py'
SRC = SERVER_PY.read_text()


def statement(fn_name: str) -> str:
    """The body of one endpoint, whitespace-collapsed."""
    start = SRC.index(f'def {fn_name}(')
    nxt = SRC.find('\n@app.route', start)
    return ' '.join(SRC[start:nxt if nxt != -1 else len(SRC)].split())


class TestClasses:
    def test_the_masks_are_the_two_the_product_offers(self):
        import server
        assert server.SHARE_MASK_SHARED_ONLY == 1
        assert server.SHARE_MASK_EVERYTHING == 3
        assert set(server.VALID_SHARE_MASKS) == {1, 3}

    @pytest.mark.parametrize('raw,expected', [
        (1, 1), (2, 2), ('2', 2),          # accepted
        (0, None), (3, None), (99, None),  # not a class
        (None, None), ('x', None), ({}, None),
    ])
    def test_only_a_real_class_survives_validation(self, raw, expected):
        import server
        assert server._share_class({'share_class': raw}) is expected or \
               server._share_class({'share_class': raw}) == expected


class TestReadIsFailClosed:
    def test_the_caregiver_read_filters_on_the_mask(self):
        sql = statement('family_documents_list')
        assert '(share_class & %s) <> 0' in sql, \
            'the caregiver read no longer filters by the grant scope'

    def test_an_unclassified_document_is_withheld(self):
        # The whole corpus predates the column. If NULL ever counts as
        # shareable, every diary written before this shipped flows again.
        sql = statement('family_documents_list')
        assert 'share_class IS NOT NULL' in sql, \
            'the read is no longer fail-closed on unclassified documents'

    def test_the_scope_comes_from_the_grant_not_the_request(self):
        sql = statement('family_documents_list')
        assert '_family_scope(request.user_id, source_user_id)' in sql
        assert "data.get('share_mask')" not in sql, \
            'the caregiver must not be able to name their own scope'


class TestWritesAreScopedToo:
    @pytest.mark.parametrize('fn', ['family_documents_update', 'family_documents_delete'])
    def test_caregiver_writes_carry_the_same_predicate(self, fn):
        sql = statement(fn)
        assert 'share_class IS NOT NULL' in sql and '(share_class & %s) <> 0' in sql, \
            f'{fn} is not scoped — a narrow grant could reach a diary entry by id'

    def test_a_caregiver_cannot_set_the_class_on_create(self):
        sql = statement('family_documents_create')
        assert '_share_class(' not in sql, \
            'the caregiver create path reads the class from the request body'
        assert 'SHARE_CLASS_SHAREABLE' in sql, \
            'a caregiver write should be classified shareable by construction'

    def test_a_caregiver_cannot_reclassify_on_update(self):
        sql = statement('family_documents_update')
        assert 'SET encrypted_data = %s, updated_at = NOW()' in sql
        assert 'share_class =' not in sql.split('SET', 1)[1].split('WHERE', 1)[0], \
            'the caregiver update writes share_class — it must only ever read it'


class TestOwnerPaths:
    def test_the_owner_classify_is_pinned_to_the_caller(self):
        sql = statement('classify_documents')
        assert 'WHERE id = %s AND user_id = %s' in sql, \
            'classify is not pinned to the caller — a caregiver could reclassify'
        assert 'request.user_id' in sql

    def test_the_owner_update_leaves_an_absent_class_alone(self):
        sql = statement('update_document')
        assert 'COALESCE(%s, share_class)' in sql, \
            'a client that omits the class would wipe it back to unclassified'


class TestGrantScope:
    def test_creating_without_a_scope_gets_the_narrow_one(self, client, mock_db, auth_token):
        import server
        src = statement('family_grant_create')
        assert "data.get('share_mask', SHARE_MASK_SHARED_ONLY)" in src, \
            'an invitation must default closed'

    def test_an_invalid_mask_is_refused(self, client, mock_db, auth_token):
        res = client.post(
            '/api/family/grants',
            headers={'Authorization': f'Bearer {auth_token}'},
            json={
                'label': 'x' * 10,
                'grant_params': 'p',
                'grant_auth': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',  # 32 raw bytes, so validation reaches the mask
                'wrapped_master': 'w',
                'share_mask': 7,
            },
        )
        assert res.status_code == 400
        assert 'share_mask' in json.loads(res.data)['error']

    def test_rescope_refuses_anything_but_the_two_masks(self, client, auth_token):
        res = client.post(
            '/api/family/grants/1/scope',
            headers={'Authorization': f'Bearer {auth_token}'},
            json={'share_mask': 2},
        )
        assert res.status_code == 400

    def test_rescope_is_owner_scoped(self):
        sql = statement('family_grant_rescope')
        assert 'source_user_id = %s' in sql and 'request.user_id' in sql, \
            'rescope is not pinned to the owner'
        assert 'revoked_at IS NULL' in sql


class TestLedger:
    def test_the_migration_is_recorded_and_additive(self):
        import server
        m = [x for x in server.MIGRATIONS if x[0] == 9]
        assert m, 'migration 9 is missing'
        _, name, sql, compatible = m[0]
        assert compatible is True, \
            'both columns are additive; marking this incompatible would make an ' \
            'auto-rollback refuse to boot'
        assert 'share_class' in sql and 'share_mask' in sql
        assert server.SCHEMA_VERSION == 9

    def test_existing_grants_default_to_the_narrow_scope(self):
        import server
        sql = [x for x in server.MIGRATIONS if x[0] == 9][0][2]
        assert re.search(r'share_mask\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1', sql), \
            'existing grants must not silently widen when this column appears'
