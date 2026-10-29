# Migration version mapping

These timestamps are chosen for ordering and are not verified creation times. They do not change the SQL. Some earlier versions were applied to an existing database. Do not replay renamed migrations there without independently reconciling that database and its migration history. No remote database was changed by this rename.

| Previous file | Current file |
| --- | --- |
| `202610230001_create_trips.sql` | `20261026082914_create_trips.sql` |
| `202610230002_create_chat.sql` | `20261026091832_create_chat.sql` |
| `202610260001_create_attachments.sql` | `20261026101408_create_attachments.sql` |
| `202610260002_documents.sql` | `20261026110643_documents.sql` |
| `202610260003_editable_documents.sql` | `20261026122117_editable_documents.sql` |
| `202610260004_plans.sql` | `20261026134829_plans.sql` |
| `202610260005_planning_integration.sql` | `20261026145652_planning_integration.sql` |
| `202610260006_catalog.sql` | `20261026160311_catalog.sql` |
| `202610260007_place_references.sql` | `20261026172536_place_references.sql` |
| `202610270001_budgets.sql` | `20261027092518_budgets.sql` |
| `202610270002_brief_checkpoint.sql` | `20261027140742_brief_checkpoint.sql` |
| `202610280001_action_results.sql` | `20261028090216_action_results.sql` |
| `202610280002_day_cover_photos.sql` | `20261028102639_day_cover_photos.sql` |
| `202610280003_supported_files.sql` | `20261028114425_supported_files.sql` |
| `202610280004_chat_failures.sql` | `20261028132354_chat_failures.sql` |
| `202610280005_chat_activity.sql` | `20261028150137_chat_activity.sql` |
