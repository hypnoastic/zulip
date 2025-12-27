from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("zerver", "0769_realm_topic_resolution_message_requirement"),
    ]

    operations = [
        migrations.RunSQL(
            """
            ALTER TABLE zerver_realm
            DROP COLUMN IF EXISTS topic_resolution_message_policy,
            DROP COLUMN IF EXISTS mandatory_topic_resolution_message_policy;
            """,
            reverse_sql="""
            -- Reverse operation is a no-op because we cannot easily restore the dropped columns
            -- with the correct type/constraints without more information or causing issues.
            -- This is intended as a cleanup migration.
            """,
        ),
    ]
