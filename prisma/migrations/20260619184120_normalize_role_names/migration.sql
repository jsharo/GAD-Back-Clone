-- Normalize legacy role names to the active application role names.
-- Existing user assignments, permissions, and assignment history are preserved.
DO $$
DECLARE
    mapping RECORD;
    legacy_role_id TEXT;
    active_role_id TEXT;
BEGIN
    FOR mapping IN
        SELECT *
        FROM (VALUES
            ('SUPERADMIN', 'ADMINISTRATOR', 'System administrator'),
            ('ARCHITECT', 'USER', 'Licensed professional (architect/engineer)')
        ) AS role_mapping(legacy_name, active_name, active_description)
    LOOP
        SELECT "id"
        INTO legacy_role_id
        FROM "role"
        WHERE "name" = mapping.legacy_name;

        SELECT "id"
        INTO active_role_id
        FROM "role"
        WHERE "name" = mapping.active_name;

        -- Preserve the existing role id and all relations when no merge is needed.
        IF active_role_id IS NULL AND legacy_role_id IS NOT NULL THEN
            UPDATE "role"
            SET
                "name" = mapping.active_name,
                "description" = COALESCE("description", mapping.active_description),
                "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = legacy_role_id;

            active_role_id := legacy_role_id;
            legacy_role_id := NULL;
        ELSIF active_role_id IS NULL THEN
            active_role_id := 'role_' || md5(mapping.active_name);

            INSERT INTO "role" ("id", "name", "description", "created_at", "updated_at")
            VALUES (
                active_role_id,
                mapping.active_name,
                mapping.active_description,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            );
        END IF;

        IF legacy_role_id IS NOT NULL AND legacy_role_id <> active_role_id THEN
            -- Merge permissions without violating the composite primary key.
            INSERT INTO "role_permission" ("role_id", "permission_id", "created_at")
            SELECT active_role_id, "permission_id", "created_at"
            FROM "role_permission"
            WHERE "role_id" = legacy_role_id
            ON CONFLICT ("role_id", "permission_id") DO NOTHING;

            DELETE FROM "role_permission"
            WHERE "role_id" = legacy_role_id;

            -- Defensive cleanup in case a database predates the unique user_id index.
            DELETE FROM "user_role" AS legacy_assignment
            USING "user_role" AS active_assignment
            WHERE legacy_assignment."role_id" = legacy_role_id
              AND active_assignment."role_id" = active_role_id
              AND active_assignment."user_id" = legacy_assignment."user_id";

            UPDATE "user_role"
            SET "role_id" = active_role_id
            WHERE "role_id" = legacy_role_id;

            -- Keep the role assignment audit history instead of cascading it away.
            UPDATE "role_assignments"
            SET "role_id" = active_role_id
            WHERE "role_id" = legacy_role_id;

            DELETE FROM "role"
            WHERE "id" = legacy_role_id;
        END IF;
    END LOOP;
END $$;
